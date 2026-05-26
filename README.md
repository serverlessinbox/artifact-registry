# @serverlessinbox/gitversion-plugin-s3

A [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) `IPlugin`/`IPackManager` that stages pre-built Lambda zips and uploads them to S3 on release.

## Installation

```bash
yarn add --dev @serverlessinbox/gitversion-plugin-s3
```

## Usage

Add the plugin to your `.gitversion.cjs` config:

```js
const { defineConfig } = require('@jwpkg/gitversion');
const { S3ArtifactPlugin } = require('@serverlessinbox/gitversion-plugin-s3');

module.exports = defineConfig({
  plugins: [
    new S3ArtifactPlugin({
      bucketName: 'my-artifacts-bucket',
      basePath: 'packages/my-lambdas',
    }),
  ],
});
```

## Configuration

The `S3ArtifactPlugin` constructor accepts a `S3ArtifactPluginProps` object with the following options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `bucketName` | `string` | Yes | — | S3 bucket where artifacts will be uploaded. |
| `basePath` | `string` | Yes | — | Base path prefix used in the S3 key template. |
| `artifactsDir` | `string` | No | `'dist/release'` | Local directory containing pre-built `.zip` files to stage. |
| `fileNameTemplate` | `string` | No | `'{basePath}/v{version}/lambdas/{filename}'` | Template for S3 object keys. Supports `{basePath}`, `{version}`, and `{filename}` variables. |

## How It Works

During the `pack` phase, all `.zip` files from `artifactsDir` are copied into the gitversion staging folder. During the `publish` phase, each staged zip is uploaded to S3 using the resolved key template (with variables replaced from the release context).

## AWS Credentials

The plugin uses `S3Client({})` from the AWS SDK, which sources credentials from the environment in the following order:

- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM role (if running on EC2, ECS, Lambda, or other AWS services)
- Credential files (e.g., `~/.aws/credentials`)
- SSO profile

Ensure your deployment environment has appropriate S3 write permissions to the configured bucket.

## License

Apache-2.0
