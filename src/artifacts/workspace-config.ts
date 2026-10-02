import * as path from 'path';
import * as t from 'typanion';
import { isArtifactType } from './artifact';

export const CONFIG_FILENAME = 'artifact-registry.cjs';

/**
 * One artifact of a workspace: `source` is a path to a file or directory (absolute or relative to
 * the workspace cwd), `objectName` the S3 object name of the output. The optional fields override
 * the workspace-level values; `bundleType: 'js-zip'` bundles a TS/JS entrypoint via esbuild into a
 * zip containing index.js.
 */
export const isS3ArtifactEntry = t.isObject({
  source: t.isString(),
  objectName: t.isString(),
  bucketName: t.isOptional(t.isString()),
  name: t.isOptional(t.isString()),
  region: t.isOptional(t.isString()),
  bundleType: t.isOptional(t.isLiteral('js-zip')),
});

export type S3ArtifactEntry = t.InferType<typeof isS3ArtifactEntry>;

/**
 * A workspace's artifact configuration: the default bucket, the artifact type and name that form
 * the S3 key prefix, and the artifacts to stage and publish.
 */
export const isS3WorkspaceConfig = t.isObject({
  bucketName: t.isString(),
  type: isArtifactType,
  name: t.isString(),
  artifacts: t.isArray(isS3ArtifactEntry),
});

export type S3WorkspaceConfig = t.InferType<typeof isS3WorkspaceConfig>;

/**
 * Loads and validates a workspace's config module (a CommonJS file exporting the config).
 * Throws the module loader's own error (code MODULE_NOT_FOUND) when the file does not exist, and
 * a field-level error naming the file when the config is malformed.
 */
export function loadWorkspaceConfig(cwd: string, fileName: string = CONFIG_FILENAME): S3WorkspaceConfig {
  const loaded: unknown = require(path.join(cwd, fileName));
  const errors: string[] = [];
  if (!isS3WorkspaceConfig(loaded, { errors })) {
    throw new Error(`${fileName}: ${errors.join('; ')}`);
  }
  return loaded;
}
