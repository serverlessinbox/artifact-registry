import type { RegistryRecord } from './registry-record';

/** One field on which two registry records disagree, with each side's value. */
export interface RecordDifference {
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
