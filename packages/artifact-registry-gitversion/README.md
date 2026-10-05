# @serverlessinbox/artifact-registry-gitversion

A [`@jwpkg/gitversion`](https://github.com/jwpkg/gitversion) plugin that publishes the artifacts of a workspace with [`@serverlessinbox/artifact-registry`](https://www.npmjs.com/package/@serverlessinbox/artifact-registry) when a release is published: each artifact goes to the versioned release path of its S3 bucket, followed by the version pointers that name the release.

Built for [ServerlessInbox](https://github.com/serverlessinbox/serverlessinbox).

## Installation

```bash
yarn add --dev @serverlessinbox/artifact-registry-gitversion @jwpkg/gitversion
```

`@jwpkg/gitversion` is a peer dependency.

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

Each workspace that publishes artifacts has an `artifact-registry.json` at its root. Workspaces without one are skipped.

```json
{
  "bucketName": "my-artifacts-eu-west-1",
  "type": "package",
  "name": "my-lambdas",
  "artifacts": [
    { "source": "dist/admin-api", "objectName": "lambdas/admin-api.zip" },
    { "source": "src/hook.ts", "objectName": "lambdas/hook.zip", "bundleType": "js-zip" }
  ]
}
```

The fields, including the per-artifact overrides for bucket, name and region, are described in the [`@serverlessinbox/artifact-registry` README](https://www.npmjs.com/package/@serverlessinbox/artifact-registry).

## What the plugin does

- **pack**: stages the artifacts of the workspace into the output folder with the `buildArtifacts` function of `@serverlessinbox/artifact-registry`. A directory is zipped, keeping its structure and file modes; a file is copied; an entry with `bundleType: "js-zip"` is bundled with esbuild into a zip holding `index.js`. Each staged file is named after the basename of its `objectName`, so basenames must be unique within a workspace. The target key and region of each file are recorded with the packed package. A workspace without `artifact-registry.json` is skipped.
- **publish**: uploads each file to `{project}/{packages|templates}/{name}/releases/v{version}/{objectName}` and writes the pointer files of its package: one global, one for `v{major}` and one for `v{major}.{minor}`, named after the dist tag (`stable`, or the prerelease label of the version). The pointer lists every `objectName` of the package. With `dryRun` the plugin logs the upload it would do and writes nothing.

The plugin publishes releases only. Channels, and the `latest` copy of template artifacts, come from the `artifact-registry` CLI.

## Requirements

- `@jwpkg/gitversion` `^1.4.0-pack-order.2`, as a peer dependency.
- AWS credentials through the default AWS SDK credential chain, with write access to the target buckets.

## License

Apache-2.0
