# @serverlessinbox/artifact-registry

This package provides two distinct capabilities for working with S3-hosted build artifacts:

- **`S3ArtifactPlugin`** — a [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) plugin that stages pre-built artifacts and uploads them to S3 on release. Requires `@jwpkg/gitversion` as a peer dependency.
- **`loadChannelVersions`** — a standalone API for resolving the current artifact versions published on a given release channel. Has no dependency on `@jwpkg/gitversion` and can be used independently (e.g. from a CDK app).

## Installation

```bash
yarn add --dev @serverlessinbox/artifact-registry
```

## Usage

Register the plugin in your root `gitversion.cjs`. The constructor takes no arguments.

```js
// gitversion.cjs
const { defineConfig } = require('@jwpkg/gitversion');
const { S3ArtifactPlugin } = require('@serverlessinbox/artifact-registry');

module.exports = defineConfig({
  plugins: [new S3ArtifactPlugin()],
});
```

Each workspace that has artifacts to publish needs an `artifact-registry.cjs` file at its root:

```js
// packages/my-lambda/artifact-registry.cjs
module.exports = {
  bucketName: 'my-artifacts-bucket',
  type: 'package',
  name: 'my-lambda',
  artifacts: [
    {
      source: 'dist/my-lambda',   // directory — zipped automatically
      objectName: 'lambdas/my-lambda.zip',
    },
    {
      source: 'cdk.out/template.json',
      objectName: 'template.json',
    },
  ],
};
```

Workspaces without an `artifact-registry.cjs` file are silently skipped.

## Configuration

### `S3WorkspaceConfig` (`artifact-registry.cjs`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bucketName` | `string` | Yes | Default S3 bucket for all artifacts in this workspace. |
| `type` | `'package' \| 'template'` | Yes | Artifact type. Determines the S3 key prefix (`packages` or `templates`). |
| `name` | `string` | Yes | Artifact name. Combined with `type` to build the S3 key prefix (e.g. `packages/my-lambda`). |
| `artifacts` | `S3ArtifactEntry[]` | Yes | List of artifacts to stage and publish. |

### `S3ArtifactEntry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | `string` | Yes | Path to the source file or directory. Absolute, or relative to the workspace root. Directories are zipped automatically. |
| `objectName` | `string` | Yes | S3 object name for the output. May include a subfolder prefix (e.g. `lambdas/my-lambda.zip`). |
| `bucketName` | `string` | No | Overrides the workspace-level `bucketName` for this artifact. |
| `name` | `string` | No | Overrides the workspace-level `name` for this artifact (used to build the S3 key prefix). |
| `region` | `string` | No | AWS region for the S3 client used to upload this artifact. Defaults to the SDK default. |
| `kind` | `'lambda-zip' \| 'ui-bundle'` | No | Artifact kind, for self-update consumers to route without hardcoding names. |

## S3 Key Structure

Every key lives under a `{project}/` prefix (default `serverlessinbox`), followed by the artifact
type (`packages` or `templates`):

```
{project}/packages/{pkg}/releases/v{version}/{objectName}      # package release object (immutable)
{project}/packages/{pkg}/releases/{track}/{distTag}.json       # package pointer (track-scoped)
{project}/templates/{name}/releases/v{version}/{objectName}    # template release object (immutable)
{project}/templates/{name}/releases/{track}/{distTag}.json     # template pointer (track-scoped)
```

A template's CloudFormation `TemplateURL` (used to reference a published nested/sub-stack template)
follows the same release-object shape as any other release object, scoped under `templates/`:

```
{project}/templates/{name}/releases/{track}/{objectName}
```

- **`track`** — how far versions may drift: `v1` (major-only) or `v1.2` (major+minor).
- **`distTag`** — which release line: `stable`, `beta`, `calendar`, … (npm dist-tag / GitVersion
  prerelease label). Defaults to `stable`.

For example, version `1.2.3` with project `serverlessinbox` and `objectName: 'lambdas/my-lambda.zip'` produces:

```
serverlessinbox/packages/my-lambda/releases/v1.2.3/lambdas/my-lambda.zip
```

...and its `stable` pointer on the `v1` track lives at:

```
serverlessinbox/packages/my-lambda/releases/v1/stable.json
```

After upload, the plugin also writes these track-scoped pointer files alongside the artifact path,
for both `package`- and `template`-type artifacts. There is no `latest-` prefix or untracked/global
pointer in this schema — every distTag is scoped to a track.

## Self-Update: TrackResolver

`TrackResolver` is a CloudFormation custom resource handler that resolves one package's current
release on a given track/distTag at deploy time, so a stack can follow a release line (e.g. "stay
on `v1`, `stable`") instead of pinning to a fixed version.

It is a pure, stateless resolver:

1. Reads the track-scoped pointer file for **one package** from S3 (`{project}/packages/{pkg}/releases/{track}/{distTag}.json`).
2. Parses the pointer's `version` and `objects`.
3. Templates the deterministic release-object S3 keys via `buildArtifactKey`.
4. Returns per-object S3 key + version as CFN `Data` attributes (readable via `Fn.GetAtt`).

Create and Update do the identical thing (resolve + return) — the physical resource ID never
changes, so an Update is always in-place. Delete is a zero-AWS-call no-op. Track format is
validated by regex (`/^v\d{1,4}(\.\d{1,4})?$/`, accepting both `v1` and `v1.2`) before any S3 call;
an invalid track throws immediately. The specific major-vs-major+minor drift *policy* is enforced
one layer up, by the CDK-side `CfnParameter` `AllowedPattern` — not by this handler.

Each `TrackResolver` custom resource instance resolves exactly one package. A stack that follows
multiple packages instantiates one resolver per package.

`project` (the leading key segment, e.g. `serverlessinbox`) is base config: it is constant for
every package lookup in a stack, so it is **not** a per-`CfnCustomResource` property. Instead the
resolver Lambda must set it once as the `PROJECT` environment variable (defaults to
`serverlessinbox` if unset) — the handler reads `process.env.PROJECT` directly. Only
`{ Package, Track, DistTag }` travel through `ResourceProperties`.

### Wiring from a CDK caller

This package exposes exactly three things a CDK construct needs to wire up a `TrackResolver`
custom resource — no CDK/construct logic lives in `@serverlessinbox/artifact-registry` itself:

```typescript
import {
  TRACK_RESOLVER_HANDLER_SOURCE,
  buildTrackResolverProperties,
  deriveTrack,
  trackResolverObjectAttrName,
  trackResolverVersionAttrName,
} from '@serverlessinbox/artifact-registry';
```

- **`TRACK_RESOLVER_HANDLER_SOURCE`** — the minified handler JS as a string, for `lambda.Code.fromInline(...)`.
  The CDK caller must set `PROJECT` as an environment variable on this Lambda (base config, constant
  for the stack) — it is not passed as a `ResourceProperties` field.
- **`buildTrackResolverProperties({ package, version, granularity, distTag? })`** — builds the exact
  `ResourceProperties` object to pass to the `CfnCustomResource` (`{ Package, Track, DistTag }`, no
  `Project`). `Track` is derived from `version` (a semver string, e.g. `1.4.2`) and `granularity`
  (`'major'` → `v{major}`, `'minor'` → `v{major}.{minor}`) — callers never construct track segments
  or parse S3 keys themselves. `DistTag` defaults to `stable`.
- **`deriveTrack(version, granularity)`** — the pure helper `buildTrackResolverProperties` uses
  internally to derive `Track`; exported as the single source of the `v{major}`/`v{major}.{minor}`
  format. Accepts both bare (`1.4.2`) and `v`-prefixed (`v1.4.2`) version strings; throws on garbage.
- **`trackResolverObjectAttrName(packageName, objectPath)`** / **`trackResolverVersionAttrName(packageName)`**
  — read back the matching `GetAtt` attribute names from the resolved custom resource.

```typescript
const resolver = new CustomResource(this, 'TrackResolver', {
  serviceToken: provider.serviceToken, // Lambda backed by TRACK_RESOLVER_HANDLER_SOURCE, with PROJECT set as an env var
  properties: buildTrackResolverProperties({
    package: 'mailbox-go',
    version: '1.4.2',
    granularity: 'major', // -> Track: 'v1'
  }),
});

const codeKey = resolver.getAttString(
  trackResolverObjectAttrName('mailbox-go', 'lambdas/admin-api.zip'),
);
```

## How It Works

During the `pack` phase the plugin reads `artifact-registry.cjs` from each workspace, resolves sources, zips any directories, and stages the output files with their target S3 key baked in.

During the `publish` phase each staged file is uploaded to S3 using the routing metadata recorded at pack time.

## AWS Credentials

The plugin uses the AWS SDK default credential chain:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (EC2 / ECS / Lambda instance profile)
- `~/.aws/credentials` / SSO profile

Ensure the environment has S3 write permission on all configured buckets.

## Local Dev: `loadChannelVersions` / `loadTrackVersions`

Two exported helpers for CDK apps (`main.ts`) that need to resolve currently published S3 object
versions ahead of synth — one for the mutable dev/release **channel** axis, one for a track/distTag
**pointer**. Both are independent of the gitversion plugin itself — no
`gitversion.cjs` or workspace config is involved.

### `loadChannelVersions`

```typescript
export interface ChannelVersionsOptions {
  artifactType: ArtifactType;             // 'package' | 'template'
  channel: string;                        // e.g. 'dev'
  bucketBase: string;                     // bucket name prefix, e.g. 'mailbox-artifacts'
  packages: Record<string, string>;       // packageName → region
}

export async function loadChannelVersions(
  options: ChannelVersionsOptions,
): Promise<Record<string, string>>
```

For each entry in `packages`, lists all objects under
`{project}/{packages|templates}/{packageName}/channels/{channel}/` (the `channel-prefix`
spec) via `ListObjectVersionsCommand`, and returns a flat map of **s3Key →
versionId** for every latest-version object found — for example:

```json
{
  "serverlessinbox/packages/mailbox-go/channels/dev/lambdas/admin-api.zip": "AbCd1234...",
  "serverlessinbox/packages/mailbox-cdk/channels/dev/lambdas/edge.zip": "WxYz5678..."
}
```

Pass this map straight through as CDK context/props so `lambda.Code.fromBucket` can pin to an
exact S3 object version. All reads are performed in parallel; the full bucket name is constructed
by appending `-{region}` to `bucketBase`, so a multi-region setup can use separate regional buckets
with a shared name prefix.

### `loadTrackVersions`

```typescript
export interface TrackVersionsOptions {
  track: string;                          // e.g. 'v1', 'v1.2'
  artifactType: ArtifactType;
  bucketBase: string;
  packages: Record<string, string>;       // packageName → region
}

export interface TrackVersionsResult {
  versionMap: Record<string, string>;       // s3Key → versionId
  resolvedVersions: Record<string, string>; // packageName → resolved semver string
}

export async function loadTrackVersions(
  options: TrackVersionsOptions,
): Promise<TrackVersionsResult>
```

For each package, reads its track-scoped `stable` pointer
(`{project}/packages/{name}/releases/{track}/stable.json`) to resolve the pinned version, then
lists all objects under that version's release prefix
(`{project}/packages/{name}/releases/v{version}/`) to build the same s3Key → versionId map shape
as `loadChannelVersions`, plus a `packageName → version` map for convenience.

### AWS credentials

Both helpers use the SDK default credential chain — set `AWS_PROFILE` in your environment for
local named-profile access, or rely on OIDC-issued environment variable credentials in CI/CD.

### Intended use

Call one of these at the top of a CDK app's `main.ts` to resolve currently published versions for
local iteration, then pass the returned map into your stack constructors. This avoids CDK context
coupling while still allowing the version to be updated by re-running the app.

```typescript
import { loadChannelVersions } from '@serverlessinbox/artifact-registry';

const versionMap = await loadChannelVersions({
  artifactType: 'package',
  channel: 'dev',
  bucketBase: 'mailbox-artifacts',
  packages: {
    'mailbox-go':  'eu-west-1',
    'mailbox-cdk': 'eu-west-1',
  },
});

new MailboxStack(app, 'MailboxStack', { versionMap });
```

## License

Apache-2.0
