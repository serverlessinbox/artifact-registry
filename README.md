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
  basePath: 'packages/my-lambda',
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
| `basePath` | `string` | Yes | Default S3 base path (e.g. `packages/my-lambda`). |
| `artifacts` | `S3ArtifactEntry[]` | Yes | List of artifacts to stage and publish. |

### `S3ArtifactEntry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | `string` | Yes | Path to the source file or directory. Absolute, or relative to the workspace root. Directories are zipped automatically. |
| `objectName` | `string` | Yes | S3 object name for the output. May include a subfolder prefix (e.g. `lambdas/my-lambda.zip`). |
| `bucketName` | `string` | No | Overrides the workspace-level `bucketName` for this artifact. |
| `basePath` | `string` | No | Overrides the workspace-level `basePath` for this artifact. |
| `region` | `string` | No | AWS region for the S3 client used to upload this artifact. Defaults to the SDK default. |

## S3 Key Structure

Keys are computed at pack time using the formula:

```
{basePath}/v{version}/{objectName}
```

For example, version `1.2.3` with `basePath: 'packages/my-lambda'` and `objectName: 'lambdas/my-lambda.zip'` produces:

```
packages/my-lambda/v1.2.3/lambdas/my-lambda.zip
```

After upload, the plugin also writes version pointer files alongside the artifact path.

### Release Tracks (Templates)

For `template`-type artifacts, `publish release` additionally writes mutable release-track copies after the immutable versioned upload. This allows consumers to reference a stable track key that is overwritten on each release rather than pinning to a specific version.

**Stable release** (e.g. `1.2.3`):

```
templates/{name}/releases/v1.2.3/template.json   — immutable versioned (existing behaviour)
templates/{name}/releases/latest/template.json   — overwritten on each stable release
templates/{name}/releases/1.x/template.json      — overwritten on each stable release
```

**Prerelease** (e.g. `1.2.3-alpha.0`):

```
templates/{name}/releases/v1.2.3-alpha.0/template.json   — immutable versioned (existing behaviour)
templates/{name}/releases/alpha/template.json             — overwritten (track = prerelease tag)
```

`package`-type artifacts are not affected — they continue to receive only the immutable versioned upload and their pointer files. No JSON pointer files are written for template tracks.

## How It Works

During the `pack` phase the plugin reads `artifact-registry.cjs` from each workspace, resolves sources, zips any directories, and stages the output files with their target S3 key baked in.

During the `publish` phase each staged file is uploaded to S3 using the routing metadata recorded at pack time.

## AWS Credentials

The plugin uses the AWS SDK default credential chain:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (EC2 / ECS / Lambda instance profile)
- `~/.aws/credentials` / SSO profile

Ensure the environment has S3 write permission on all configured buckets.

## Local Dev: `loadChannelVersions`

`loadChannelVersions` is an exported helper for CDK apps (`main.ts`) that need to resolve which artifact versions are currently published on a given dev channel. It is independent of the gitversion plugin itself — no `gitversion.cjs` or workspace config is involved.

### Signature

```typescript
export interface ChannelVersionsOptions {
  channel: string;                        // e.g. 'dev'
  bucketBase: string;                     // bucket name prefix, e.g. 'mailbox-artifacts'
  packages: Record<string, string>;       // packageName → region
}

export async function loadChannelVersions(
  options: ChannelVersionsOptions,
): Promise<Record<string, string>>
```

### Return value

A `Record<packageName, semverVersionString>` — for example:

```json
{
  "mailbox-go": "1.5.2",
  "mailbox-cdk": "1.5.2"
}
```

### How it works

For each entry in `packages`, the function reads:

```
s3://{bucketBase}-{region}/packages/{packageName}/channels/{channel}/latest-stable.json
```

All reads are performed in parallel. The full bucket name is constructed by appending `-{region}` to `bucketBase`, so a multi-region setup can use separate regional buckets with a shared name prefix.

### AWS credentials

The SDK default credential chain is used — set `AWS_PROFILE` in your environment for local named-profile access, or rely on OIDC-issued environment variable credentials in CI/CD.

### Intended use

Call `loadChannelVersions` at the top of a CDK app's `main.ts` to resolve current dev-channel versions for local iteration, then pass the returned map into your stack constructors. This avoids CDK context coupling while still allowing the version to be updated by re-running the app.

```typescript
import { loadChannelVersions } from '@serverlessinbox/artifact-registry';

const versions = await loadChannelVersions({
  channel: 'dev',
  bucketBase: 'mailbox-artifacts',
  packages: {
    'mailbox-go':  'eu-west-1',
    'mailbox-cdk': 'eu-west-1',
  },
});

new MailboxStack(app, 'MailboxStack', { versions });
```

## License

Apache-2.0
