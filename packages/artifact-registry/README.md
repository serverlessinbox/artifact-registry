# @serverlessinbox/artifact-registry

Publishes build artifacts to versioned, per-region S3 buckets in a fixed layout, and finds them again by version, channel or track.

Built for [ServerlessInbox](https://github.com/serverlessinbox/serverlessinbox).

## Why this package exists

Infrastructure-as-code deployments usually upload their own assets (function code, static files, nested templates) at deploy time, into a staging location that must first exist in the target account. That ties a deployment to a prepared account and a build machine. `artifact-registry` separates publishing from deploying: assets are published ahead of time to versioned S3 locations per region, in a fixed layout, and templates reference those locations directly. A deployment then needs no staging, no upload and no preparation, so it works in any AWS account. (With CDK, for example, this removes the need for `cdk bootstrap`.)

The package defines that layout and provides both sides:

- **Publishing**: a CLI and a programmatic API put each artifact in the right place, as an immutable release, on a channel, and behind track pointers.
- **Reading**: loaders, a resolver and key builders find where an artifact for a given version, channel or track lives, so no consumer hand-writes an S3 key.

Publishing as part of a [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) release is done by the separate `@serverlessinbox/artifact-registry-gitversion` package, which builds on this one.

## Concepts

| Concept | Meaning |
|---|---|
| Artifact type | `package` (keys under `packages/`) or `template` (keys under `templates/`). Together with a name it identifies one published unit, for example `package` + `my-lambdas`. |
| Release | An immutable, versioned set of objects at `releases/v{version}/`. The version never carries a `v`; the path adds it. |
| Channel | A mutable path, `channels/{channel}/` (for example `dev`). Each publish overwrites the same keys; the history is the S3 object versions of those keys. |
| Track | A version line: `v{major}` (for example `v1`) or `v{major}.{minor}` (for example `v1.4`). Track names always carry a `v`. |
| Pointer file | `{distTag}.json`, written globally and once per track. It names the current version of a release line and the objects in it: `{ version, publishedAt, objects: [{ name }] }`. A consumer following track `v1` reads `releases/v1/stable.json`. `distTag` is `stable` for a normal release, or the prerelease label (for example `beta` from `1.2.0-beta.0`) for a prerelease. |
| `latest` template copy | For `template` artifacts, `publish release` also uploads each template to a version-less key, `releases/latest/{objectName}` for a stable release or `releases/{prereleaseLabel}/{objectName}` for a prerelease. |
| Regional bucket | One bucket per region, named `{bucketBase}-{region}`, for example `my-artifacts-eu-west-1`. Lambda code must live in the region of the function that uses it, so every region in use has its own bucket. |

## Installation

```bash
yarn add --dev @serverlessinbox/artifact-registry
```

## Publishing

### Workspace config

Each workspace that publishes artifacts has an `artifact-registry.json` at its root. The CLI and `buildArtifacts` read it; the field reference is under [Reference](#artifact-registryjson).

```json
{
  "bucketName": "my-artifacts-eu-west-1",
  "type": "package",
  "name": "my-lambdas",
  "artifacts": [
    { "source": "dist/admin-api", "objectName": "lambdas/admin-api.zip" },
    { "source": "dist/manifest.json", "objectName": "manifest.json" }
  ]
}
```

To publish to buckets in more than one region, an entry can override the bucket, the package name and the region of the S3 client:

```json
{
  "bucketName": "my-artifacts-eu-west-1",
  "type": "package",
  "name": "my-lambdas",
  "artifacts": [
    { "source": "dist/api", "objectName": "lambdas/api.zip", "region": "eu-west-1" },
    { "source": "dist/edge", "objectName": "lambdas/edge.zip", "bucketName": "my-artifacts-us-east-1", "region": "us-east-1" },
    { "source": "src/hook.ts", "objectName": "lambdas/hook.zip", "bundleType": "js-zip" }
  ]
}
```

### CLI

The package installs the `artifact-registry` binary. The `publish` and `resolve-artifacts` commands accept `--profile` to set `AWS_PROFILE` for the run.

| Command | What it does | Options |
|---|---|---|
| `build` | Builds the artifacts of `artifact-registry.json` into an output folder without uploading: a `js-zip` entry is bundled with esbuild into a zip holding `index.js`, a directory is zipped, a file is copied. Prints the written file names. | `--cwd` workspace directory (default: current directory); `--output` output folder (required) |
| `publish channel` | Uploads artifacts to `channels/{channel}/{objectName}`. Writes no pointers and no tracks. | `--cwd`; `--channel` (default: `dev`); `--profile`; `--object` publish only the artifact with this `objectName` |
| `publish release` | Uploads artifacts to `releases/v{version}/{objectName}`, writes the pointer files, and for `template` artifacts also writes the `latest` copy (or the prerelease-labelled copy). | `--version` (required, semver); `--cwd`; `--profile`; `--object` |
| `resolve-artifacts` | Reads the `stable` pointer of each component and writes a flat JSON object of component to version to every `--output`. Reads only. | `--bucket` (required); `--region`; `--profile`; `--component` (required, `key:type:name`, repeatable); `--track` (for example `v1`; without it the global pointer is read); `--output` (required, repeatable) |

`publish channel` and `publish release` upload the file at each `source` as it is. They neither zip a directory nor apply `bundleType`, so `source` must name a file, for example the output of `build`.

```bash
yarn artifact-registry build --cwd packages/my-lambdas --output dist/artifacts

yarn artifact-registry publish channel --channel dev --object lambdas/admin-api.zip

yarn artifact-registry publish release --version 1.2.3

yarn artifact-registry resolve-artifacts \
  --bucket my-artifacts-eu-west-1 --region eu-west-1 --track v1 \
  --component my-lambdas:package:my-lambdas --output artifact-versions.json
```

### From code

`buildArtifacts(workspaceCwd, outputFolder, configOverride?)` does what the `build` command does and returns `{ outputFiles, routingMap }`: the basenames of the files written to `outputFolder`, and for each basename where it is published (`package`, `objectName` and `region`). The config comes from `configOverride` when given, otherwise from `artifact-registry.json` in `workspaceCwd`; a workspace without that file yields no outputs. `outputFolder` must already exist. The output file is named after the basename of the `objectName`, so basenames must be unique within a workspace.

`S3Uploader` writes to S3 under the key layouts of `buildArtifactKey`. It uploads what it is given and never lists or deletes objects.

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { SemVer } from 'semver';
import { S3Uploader, buildArtifactKey, buildArtifacts } from '@serverlessinbox/artifact-registry';
import type { ArtifactPackage } from '@serverlessinbox/artifact-registry';

const built = await buildArtifacts('packages/my-lambdas', 'dist/artifacts');

const uploader = new S3Uploader(new S3Client({ region: 'eu-west-1' }));
const version = new SemVer('1.2.3');

for (const [basename, routing] of built.routingMap) {
  const pkg: ArtifactPackage = routing.package;
  const file = `dist/artifacts/${basename}`;

  await uploader.uploadChannel(pkg, 'dev', routing.objectName, file);

  const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version, objectName: routing.objectName });
  await uploader.upload(pkg.bucketName, key, file);
}

const pkg: ArtifactPackage = { bucketName: 'my-artifacts-eu-west-1', artifactType: 'package', name: 'my-lambdas' };
await uploader.writeVersionPointers({ package: pkg, objects: built.outputFiles.map((name) => ({ name })) }, version);
```

- `upload(bucket, key, filePath)`: uploads one file.
- `uploadChannel(pkg, channel, objectName, filePath)`: uploads one file to the channel path.
- `uploadJson(bucket, key, data)`: uploads a JSON document with content type `application/json`.
- `writeVersionPointers(release, version)`: writes the pointer file of `release.package`: one global, one for `v{major}` and one for `v{major}.{minor}`, named after the dist tag (`stable`, or the first prerelease label of `version`). `release.objects` lists every object of the release and must not be empty for a reader to accept the pointer.
- `uploadReleaseTrack(copy, track)`: uploads each entry of a release track copy to `releases/{track}/{objectName}`.

## Reading

Packages live in buckets in different regions, so construct the `S3Client` with `followRegionRedirects: true`.

```ts
import { S3Client } from '@aws-sdk/client-s3';
import {
  ArtifactResolver,
  buildArtifactArn,
  buildArtifactBucketName,
  buildArtifactKey,
  buildArtifactUrl,
  buildReleasePointerKey,
  deriveTrack,
  loadChannelVersions,
  loadTrackVersions,
  readReleasePointer,
} from '@serverlessinbox/artifact-registry';
import type { IArtifactResolver } from '@serverlessinbox/artifact-registry';

const client = new S3Client({ region: 'eu-west-1', followRegionRedirects: true });
```

### Loaders

`loadChannelVersions(client, options)` lists every object under the channel of each package and returns a flat map of S3 key to the S3 version ID of its latest version.

```ts
const channelVersionIds: Record<string, string> = await loadChannelVersions(client, {
  artifactType: 'package',
  channel: 'dev',
  bucketBase: 'my-artifacts',
  packages: { 'my-lambdas': 'eu-west-1', 'my-edge-lambdas': 'us-east-1' },
});
```

`loadTrackVersions(client, options)` reads the `stable` pointer of each package (the track-scoped one, or the global one when `track` is omitted), then lists the objects of the version it names. It returns `versionMap` (S3 key to version ID) and `resolvedVersions` (package name to semver). It throws when a pointer is missing or malformed.

```ts
const { versionMap, resolvedVersions } = await loadTrackVersions(client, {
  track: 'v1',
  artifactType: 'package',
  bucketBase: 'my-artifacts',
  packages: { 'my-lambdas': 'eu-west-1' },
});
```

Both take `packages` as a map of package name to region; the bucket of each is `{bucketBase}-{region}`.

`readReleasePointer(client, packageName, distTag, region, options?)` reads and validates one `package` pointer. `options` takes `bucketBase`, `project` and `track`; without `track` it reads the global pointer. It throws when the pointer is missing, empty, not valid JSON or malformed. The client must be configured for `region`.

```ts
const pointer = await readReleasePointer(client, 'my-lambdas', 'stable', 'eu-west-1', {
  bucketBase: 'my-artifacts',
  track: 'v1',
});
console.log(pointer.version, pointer.publishedAt, pointer.objects.map((o) => o.name));
```

### Resolver

`ArtifactResolver` implements `IArtifactResolver`: a synchronous lookup, per package name, of where an object lives. It reads nothing from S3. Each package has a pinned `version`, a `zone` (`regional` resolves in `deploymentRegion`, `edge` always in `us-east-1`) and optionally a `channel`, which makes it resolve under the channel path instead of the release path of its version. Construction throws when no bucket base is given, either as `versions.bucketBase` or as `bucketBaseOverride`.

```ts
const resolver: IArtifactResolver = new ArtifactResolver({
  versions: {
    bucketBase: 'my-artifacts',
    packages: {
      'my-lambdas': { version: '1.4.2', zone: 'regional' },
      'my-edge-lambdas': { version: '1.4.2', zone: 'edge' },
      'my-dev-lambdas': { version: '1.4.2', zone: 'regional', channel: 'dev' },
    },
  },
  deploymentRegion: 'eu-west-1',
  s3VersionMap: channelVersionIds,
});
const { bucket, key, versionId } = resolver.resolve('my-lambdas', 'lambdas/admin-api.zip');
console.log(bucket, key, versionId, resolver.getUrl('my-lambdas', 'lambdas/admin-api.zip'), resolver.getArn('my-lambdas', 'lambdas/admin-api.zip'));
console.log(resolver.getVersion('my-lambdas'), resolver.getBucketBase());
```

`resolve` returns `{ bucket, key, versionId? }`; `versionId` is present when the key is listed in `s3VersionMap`. `getUrl`, `getArn` and `getVersion` take the same package name and throw for a package the resolver does not know. The options also accept `artifactType` (default `package`) and `project`.

### Keys, URLs and ARNs

```ts
const releaseKey: string = buildArtifactKey('package', 'my-lambdas', {
  type: 'release',
  version: { version: '1.4.2' },
  objectName: 'lambdas/admin-api.zip',
});
const channelKey: string = buildArtifactKey('package', 'my-lambdas', {
  type: 'channel',
  channel: 'dev',
  objectName: 'lambdas/admin-api.zip',
});
const pointerKey: string = buildReleasePointerKey('package', 'my-lambdas', { track: 'v1', distTag: 'beta' });
const bucketName: string = buildArtifactBucketName('my-artifacts', 'eu-west-1');
const url: string = buildArtifactUrl(bucketName, 'eu-west-1', releaseKey, 'abc123');
const arn: string = buildArtifactArn(bucketName, releaseKey);
const track: string = deriveTrack('1.4.2', 'minor');
```

- `buildArtifactKey(artifactType, name, spec)`: the S3 key for the layout `spec.type` selects (see the key layout below). Every spec takes an optional `project` that replaces the leading key segment.
- `buildReleasePointerKey(artifactType, name, { track?, distTag?, project? })`: the pointer key. `distTag` defaults to `stable`; without `track` it is the global pointer.
- `buildArtifactBucketName(bucketBase, region)`: `{bucketBase}-{region}`.
- `buildArtifactUrl(bucket, region, key, versionId?)`: `https://{bucket}.s3.{region}.amazonaws.com/{key}`, with `?versionId=` appended when given.
- `buildArtifactArn(bucket, key)`: `arn:aws:s3:::{bucket}/{key}`.
- `deriveTrack(version, granularity)`: `'major'` gives `v1`, `'minor'` gives `v1.4`. Pass a version without a `v`; it throws on anything that is not `major.minor.patch` with an optional prerelease or build suffix, including a `v`-prefixed version.

## Reference

### `artifact-registry.json`

| Field | Type | Required | Description |
|---|---|---|---|
| `bucketName` | string | yes | Default S3 bucket for the workspace's artifacts. The full bucket name, region suffix included. |
| `type` | `"package"` or `"template"` | yes | Artifact type; selects the `packages` or `templates` key prefix. |
| `name` | string | yes | Artifact name in the key, for example `my-lambdas`. |
| `artifacts` | array | yes | The artifacts to build and publish. |
| `artifacts[].source` | string | yes | Path to a file or a directory, absolute or relative to the workspace directory. A directory is zipped; a file is copied. |
| `artifacts[].objectName` | string | yes | Object name in S3, for example `lambdas/admin-api.zip`. Its basename names the built file, so basenames must be unique within a workspace. |
| `artifacts[].bucketName` | string | no | Overrides `bucketName` for this artifact. |
| `artifacts[].name` | string | no | Overrides `name` for this artifact. |
| `artifacts[].region` | string | no | Region of the S3 client used to upload this artifact. Defaults to the SDK default. |
| `artifacts[].bundleType` | `"js-zip"` | no | Used by `build`: bundles a TypeScript or JavaScript entry point with esbuild into a zip holding `index.js`. |

### S3 key layout

`{project}` defaults to `serverlessinbox`. `{prefix}` is `packages` for `package` and `templates` for `template`. The CLI always uses the default `{project}`.

| Kind | Key |
|---|---|
| Release object | `{project}/{prefix}/{name}/releases/v{version}/{objectName}` |
| Channel object | `{project}/{prefix}/{name}/channels/{channel}/{objectName}` |
| Channel prefix | `{project}/{prefix}/{name}/channels/{channel}/` |
| Pointer, track | `{project}/{prefix}/{name}/releases/{track}/{distTag}.json` |
| Pointer, global | `{project}/{prefix}/{name}/releases/{distTag}.json` |
| Track copy, for example `latest` | `{project}/{prefix}/{name}/releases/{track}/{objectName}` |
| Release with placeholders | `{project}/{prefix}/{name}/releases/v{version}/{objectName}`, with the literal text `{version}` and `{objectName}` |

For version `1.2.3` of package `my-lambdas`, object `lambdas/admin-api.zip`:

```
serverlessinbox/packages/my-lambdas/releases/v1.2.3/lambdas/admin-api.zip
serverlessinbox/packages/my-lambdas/releases/stable.json
serverlessinbox/packages/my-lambdas/releases/v1/stable.json
serverlessinbox/packages/my-lambdas/releases/v1.2/stable.json
```

### Requirements

- AWS credentials through the default AWS SDK credential chain: environment variables, a shared profile or SSO profile (`AWS_PROFILE`, or `--profile` on the CLI), or a role. Publishing needs write access to the target buckets. Reading pointers needs read access to them; `loadChannelVersions` and `loadTrackVersions` also list object versions, and so need permission to do that.
- The package does not declare a Node.js version range.

## License

Apache-2.0
