# @serverlessinbox/artifact-tools

A [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) plugin that stages pre-built artifacts and uploads them to S3 on release.

## Installation

```bash
yarn add --dev @serverlessinbox/artifact-tools
```

Requires `@jwpkg/gitversion` as a peer dependency.

## Usage

Register the plugin in your root `gitversion.cjs`. The constructor takes no arguments.

```js
// gitversion.cjs
const { defineConfig } = require('@jwpkg/gitversion');
const { S3ArtifactPlugin } = require('@serverlessinbox/artifact-tools');

module.exports = defineConfig({
  plugins: [new S3ArtifactPlugin()],
});
```

Each workspace that has artifacts to publish needs a `gitversion-s3.cjs` file at its root:

```js
// packages/my-lambda/gitversion-s3.cjs
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

Workspaces without a `gitversion-s3.cjs` file are silently skipped.

## Configuration

### `S3WorkspaceConfig` (`gitversion-s3.cjs`)

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

## How It Works

During the `pack` phase the plugin reads `gitversion-s3.cjs` from each workspace, resolves sources, zips any directories, and stages the output files with their target S3 key baked in.

During the `publish` phase each staged file is uploaded to S3 using the routing metadata recorded at pack time.

## AWS Credentials

The plugin uses the AWS SDK default credential chain:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (EC2 / ECS / Lambda instance profile)
- `~/.aws/credentials` / SSO profile

Ensure the environment has S3 write permission on all configured buckets.

## License

Apache-2.0
