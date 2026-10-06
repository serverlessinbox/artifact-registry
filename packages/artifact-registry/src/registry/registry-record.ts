import * as t from 'typanion';
import { isRegistryConfig } from './registry-location';

export const isRegistryRecord = t.isObject({
  ...isRegistryConfig.properties,
  schemaVersion: t.isLiteral(1),
  ownerAccountId: t.cascade(t.isString(), [t.matchesRegExp(/^\d{12}$/)]),
});

/**
 * A registry record: the configuration where artifacts are published (bucketBase, project,
 * regions, optional bucket overrides) plus the schema version and the AWS account ID that owns
 * the buckets. Written to the record key in every region bucket once and fetched to verify the
 * record is complete and readable.
 */
export type RegistryRecord = t.InferType<typeof isRegistryRecord>;

/**
 * The S3 key where the registry record lives in every region bucket.
 *
 * @param project — the registry project prefix (e.g., 'serverlessinbox')
 * @returns the key, e.g., `serverlessinbox/registry.json`
 */
export function registryRecordKey(project: string): string {
  return `${project}/registry.json`;
}

/**
 * Parses and validates a registry record from JSON text.
 *
 * @param text — the JSON text to parse
 * @param source — a human-readable source name (path, URL, or bucket/key) used in error messages
 * @returns the validated RegistryRecord
 * @throws an error naming the source and the validation failure
 */
export function parseRegistryRecord(text: string, source: string): RegistryRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`registry record ${source}: not valid JSON`);
  }

  const errors: string[] = [];
  if (!isRegistryRecord(parsed, { errors })) {
    throw new Error(`registry record ${source}: ${errors.join('; ')}`);
  }

  return parsed;
}
