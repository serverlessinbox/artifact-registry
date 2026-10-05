import * as t from 'typanion';
import { isArtifactRouting } from '@serverlessinbox/artifact-registry';

export const isArtifactMapEntry = t.isObject({
  ...isArtifactRouting.properties,
  key: t.isString(),
});

/** The routing of one packed artifact file plus the S3 key it is uploaded to, recorded at pack time. */
export type ArtifactMapEntry = t.InferType<typeof isArtifactMapEntry>;

export const isArtifactMap = t.isDict(isArtifactMapEntry);

/** The artifact routing recorded by `pack`, keyed by packed file basename. */
export type ArtifactMap = t.InferType<typeof isArtifactMap>;

/**
 * Validates the routing map a packed package carries in its plugin data.
 * Throws a field-level error naming the plugin data when malformed.
 */
export function readArtifactMap(pluginData: unknown): ArtifactMap {
  const errors: string[] = [];
  if (!isArtifactMap(pluginData, { errors })) {
    throw new Error(`s3-artifact pluginData: ${errors.join('; ')}`);
  }
  return pluginData;
}
