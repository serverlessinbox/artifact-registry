import type { S3Client } from '@aws-sdk/client-s3';
import { AccessDenied, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import * as t from 'typanion';
import type { RegistryConfig, RegistryLocation } from './registry-location';
import { isRegistryConfig } from './registry-location';
import { buildArtifactBucketName } from './artifact-target';

const isNonEmptyString = t.cascade(t.isString(), [t.hasMinLength(1)]);

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

/**
 * Loads and validates the registry record from S3.
 *
 * @param client — the S3 client to read through
 * @param location — the registry location that names the bucket and key prefix
 * @param region — the AWS region of the bucket
 * @returns the validated RegistryRecord
 * @throws when the record cannot be loaded or parsed; error messages name the bucket and key
 */
export async function loadRegistryRecord(
  client: S3Client,
  location: RegistryLocation,
  region: string,
): Promise<RegistryRecord> {
  const bucket = buildArtifactBucketName(location, region);
  const key = registryRecordKey(location.project);
  const source = `s3://${bucket}/${key}`;

  let body: string;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    body = await res.Body.transformToString('utf-8');
  } catch (err: unknown) {
    if (err instanceof NoSuchKey || (err instanceof Error && err.name === 'NoSuchKey')) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    if (err instanceof AccessDenied || (err instanceof Error && err.name === 'AccessDenied')) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    throw err;
  }

  if (body === '') {
    throw new Error(`registry record ${source}: missing or not readable`);
  }

  return parseRegistryRecord(body, source);
}

/** Comparison result: field name and file/live values, or null if equal. */
interface RecordDifference {
  field: string;
  fileValue: unknown;
  liveValue: unknown;
}

/**
 * Compares a file record to a live record and returns the fields that differ.
 * Comparison is done without mutating inputs: regions as sets, overrides as maps.
 *
 * @param fileRecord — the record from the file
 * @param liveRecord — the record from S3
 * @returns an array of differing fields with their values, or empty if equal
 */
export function compareRegistryRecords(
  fileRecord: RegistryRecord,
  liveRecord: RegistryRecord,
): RecordDifference[] {
  const differences: RecordDifference[] = [];

  if (fileRecord.schemaVersion !== liveRecord.schemaVersion) {
    differences.push({
      field: 'schemaVersion',
      fileValue: fileRecord.schemaVersion,
      liveValue: liveRecord.schemaVersion,
    });
  }
  if (fileRecord.bucketBase !== liveRecord.bucketBase) {
    differences.push({
      field: 'bucketBase',
      fileValue: fileRecord.bucketBase,
      liveValue: liveRecord.bucketBase,
    });
  }
  if (fileRecord.project !== liveRecord.project) {
    differences.push({
      field: 'project',
      fileValue: fileRecord.project,
      liveValue: liveRecord.project,
    });
  }
  if (fileRecord.ownerAccountId !== liveRecord.ownerAccountId) {
    differences.push({
      field: 'ownerAccountId',
      fileValue: fileRecord.ownerAccountId,
      liveValue: liveRecord.ownerAccountId,
    });
  }

  const fileRegionsSet = new Set(fileRecord.regions);
  const liveRegionsSet = new Set(liveRecord.regions);
  if (
    fileRegionsSet.size !== liveRegionsSet.size ||
    ![...fileRegionsSet].every((r) => liveRegionsSet.has(r))
  ) {
    differences.push({
      field: 'regions',
      fileValue: fileRecord.regions,
      liveValue: liveRecord.regions,
    });
  }

  const fileOverrides = fileRecord.bucketOverrides || {};
  const liveOverrides = liveRecord.bucketOverrides || {};
  const fileKeys = Object.keys(fileOverrides).sort();
  const liveKeys = Object.keys(liveOverrides).sort();
  if (
    fileKeys.length !== liveKeys.length ||
    fileKeys.some((k, i) => k !== liveKeys[i]) ||
    fileKeys.some((k) => fileOverrides[k] !== liveOverrides[k])
  ) {
    differences.push({
      field: 'bucketOverrides',
      fileValue: fileOverrides,
      liveValue: liveOverrides,
    });
  }

  return differences;
}
