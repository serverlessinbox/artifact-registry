# @serverlessinbox/jsii-bundler

Bundles a jsii CDK construct library's TypeScript sources into `lib/` with esbuild, inlining its non-jsii dependencies and keeping jsii packages external, and bundles a Lambda entry file into a zip holding a single `index.js`.

Built for [ServerlessInbox](https://github.com/serverlessinbox/serverlessinbox).

This package is private for now and will be published as its own package one day.

## Why this package exists

jsii requires every non-jsii dependency of a construct library to be bundled into the published package. The standard mechanism for that, npm `bundledDependencies`, copies those dependencies from `node_modules` at pack time. Under Yarn Plug'n'Play there is no `node_modules`, so `bundledDependencies` produces a tarball without them.

`jsii-bundler` bundles the dependencies another way. At pack time esbuild inlines the non-jsii code into `lib/`, so the package needs no `bundledDependencies` and a non-jsii dependency is only a devDependency. The bundler must still leave jsii packages alone, so that every library refers to the one shared copy of a jsii type. It compiles each source file with esbuild, inlines the packages that are not jsii packages, and leaves two kinds of import external:

- Imports of a jsii package. A package counts as a jsii package when it ships the `.jsii` assembly file at its root; a deep import such as `pkg/sub/file` is judged by its nearest ancestor that resolves to a package root.
- Relative imports made by the package's own files, so each source file stays its own output module.

Once the bundle succeeds it emits the `.d.ts` files with `tsc --emitDeclarationOnly`.

The same esbuild setup also packages a Lambda: a single entry file becomes one CommonJS `index.js` inside a zip.

## Requirements

- `esbuild`, installed by the consuming package as a peer dependency (`^0.27.1`).
- The system `zip` binary on the `PATH`, for `lambda-zip` only.

## Using it from a construct library

Add the package and `esbuild` as dev dependencies of the library. Declare each non-jsii dependency the library imports as a devDependency too, not as `bundledDependencies`: esbuild inlines it into `lib/` at pack time. Bundle in the library's `prepack` script:

```json
{
  "scripts": {
    "prepack": "yarn prepare-manifest build && jsii-bundler package ."
  }
}
```

## Commands

### `jsii-bundler package <package-folder>`

Bundles `src/**/*.ts` (declaration files excluded) of a jsii package to `lib/`, then emits the `.d.ts` files.

```
jsii-bundler package .
```

| Argument | Meaning |
|---|---|
| `package-folder` | Required. The folder of the jsii package to bundle, relative to the current directory; an absolute path is not accepted. Given once. |

Paths listed in the package's `jsii.excludeTypescript` in `package.json` are left out of the bundle. A bundling error fails the command; a failing declaration emit does not.

### `jsii-bundler lambda-zip`

Bundles a TypeScript or JavaScript Lambda entry into a zip containing a single `index.js`: CommonJS, for Node.js, without source maps. The zip holds no directory entries.

```
jsii-bundler lambda-zip --entry src/handler.ts --out /tmp/handler.zip
```

| Option | Default | Meaning |
|---|---|---|
| `--entry` | none, required | Path to the Lambda entry file, relative to the current directory or absolute. Given once. |
| `--out` | none, required | Path of the zip to write, relative to the current directory or absolute. Missing folders are created and an existing zip is replaced. Given once. |
| `--target` | `node24` | The esbuild target the bundle is compiled for. Given once. |
| `--minify` | on | Minify the bundle. Pass `--no-minify` to turn it off. |
| `--external` | `@aws-sdk/*` | Comma-separated package patterns left out of the bundle. The default is what the Lambda Node.js runtime already provides. Given once, with several patterns separated by commas. |

An esbuild error, or a `zip` that exits non-zero, fails the command.
