import { readFile } from 'fs/promises';
import * as path from 'path';
import * as t from 'typanion';
import { isArtifactType } from './artifact';

export const CONFIG_FILENAME = 'artifact-registry.json';

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
 * Loads and validates a workspace's JSON config file.
 * Throws the file system's own error (code ENOENT) when the file does not exist, an error naming
 * the file when it is not valid JSON, and a field-level error naming the file when the config is
 * malformed.
 */
export async function loadWorkspaceConfig(cwd: string, fileName: string = CONFIG_FILENAME): Promise<S3WorkspaceConfig> {
  const content = await readFile(path.join(cwd, fileName), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    throw new Error(`${fileName} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const errors: string[] = [];
  if (!isS3WorkspaceConfig(parsed, { errors })) {
    throw new Error(`${fileName}: ${errors.join('; ')}`);
  }
  return parsed;
}
