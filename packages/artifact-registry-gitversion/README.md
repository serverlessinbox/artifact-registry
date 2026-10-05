# @serverlessinbox/artifact-registry-gitversion

A [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) plugin that packs the artifacts of a workspace and publishes them to an S3 artifact registry with [`@serverlessinbox/artifact-registry`](https://www.npmjs.com/package/@serverlessinbox/artifact-registry) when a release is published.

Built for [ServerlessInbox](https://github.com/serverlessinbox/serverlessinbox).

## Installation

```bash
yarn add --dev @serverlessinbox/artifact-registry-gitversion @jwpkg/gitversion
```

## Registration

Register `S3ArtifactPlugin` in `.gitversion.cjs`. The constructor takes no arguments.

```js
const { defineConfig } = require('@jwpkg/gitversion');
const { S3ArtifactPlugin } = require('@serverlessinbox/artifact-registry-gitversion');

module.exports = defineConfig({
  plugins: [new S3ArtifactPlugin()],
});
```

## Workspace config

A workspace that publishes artifacts has an `artifact-registry.json` at its root. The fields, including the regions each artifact is published to, are described in the [`@serverlessinbox/artifact-registry` README](https://www.npmjs.com/package/@serverlessinbox/artifact-registry).

```json
{
  "registry": {
    "bucketBase": "example-artifacts",
    "project": "example",
    "regions": ["eu-west-1", "us-east-1"]
  },
  "type": "package",
  "name": "example-api",
  "artifacts": [
    { "source": "dist/handler", "objectName": "lambdas/handler.zip" },
    { "source": "src/hook.ts", "objectName": "lambdas/hook.zip", "bundleType": "js-zip" }
  ]
}
```

## What the plugin does

- **pack**: builds the workspace's artifacts into the output folder with `buildArtifacts` (a directory is zipped, a file is copied, a `js-zip` entry is bundled with esbuild), and records each file's package, `objectName`, S3 key and target buckets in the packed package's plugin data. A workspace without `artifact-registry.json` is skipped. Each file is named after the basename of its `objectName`, so basenames must be unique within a workspace.
- **publish**: uploads each file to all of its target regions at `{project}/{packages|templates}/{name}/releases/v{version}/{objectName}`. After the last file of a package is uploaded, it writes that package's pointers to the package's regions; the pointer lists every `objectName` of the package. A file without recorded routing is logged and skipped. With `dryRun` it logs each upload it would do and writes nothing.

The plugin publishes releases only. Channels, and the track copies of template artifacts, come from the `artifact-registry` CLI.

## Requirements

- `@jwpkg/gitversion` `^1.4.0-pack-order.2`, as a peer dependency.
- AWS credentials through the default AWS SDK credential chain, with write access to the target buckets.

## License

Apache-2.0
