import type { RegistryRecord } from '../registry-record';
import { compareRegistryRecords } from '../compare-registry-records';

/**
 * Pins which differences `registry-record check` reports: any field that differs is listed, while
 * region order and bucket-override key order never count. A false "equal" hides a registry that
 * has drifted from its record.
 */
describe('compareRegistryRecords', () => {
  const baseRecord: RegistryRecord = {
    schemaVersion: 1,
    bucketBase: 'artifacts',
    project: 'example',
    regions: ['eu-west-1', 'us-east-1'],
    ownerAccountId: '123456789012',
  };

  it('returns empty array when records are identical', () => {
    const record = { ...baseRecord };
    expect(compareRegistryRecords(record, record)).toEqual([]);
  });

  it('detects bucketBase difference', () => {
    const other: RegistryRecord = { ...baseRecord, bucketBase: 'other' };
    const diffs = compareRegistryRecords(baseRecord, other);
    expect(diffs.some((d) => d.field === 'bucketBase')).toBe(true);
  });

  it('detects regions difference regardless of order', () => {
    const record1: RegistryRecord = { ...baseRecord, regions: ['eu-west-1', 'us-east-1'] };
    const record2: RegistryRecord = { ...baseRecord, regions: ['us-east-1', 'eu-west-1'] };
    expect(compareRegistryRecords(record1, record2)).toEqual([]);
  });

  it('detects when regions differ in content', () => {
    const other: RegistryRecord = { ...baseRecord, regions: ['eu-west-1'] };
    const diffs = compareRegistryRecords(baseRecord, other);
    expect(diffs.some((d) => d.field === 'regions')).toBe(true);
  });

  it('treats empty and missing bucketOverrides as equal', () => {
    const record1: RegistryRecord = { ...baseRecord };
    const record2: RegistryRecord = { ...baseRecord, bucketOverrides: {} };
    expect(compareRegistryRecords(record1, record2)).toEqual([]);
  });

  it('detects bucketOverrides difference regardless of key order', () => {
    const record1: RegistryRecord = {
      ...baseRecord,
      bucketOverrides: { 'us-east-1': 'bucket1', 'eu-west-1': 'bucket2' },
    };
    const record2: RegistryRecord = {
      ...baseRecord,
      bucketOverrides: { 'eu-west-1': 'bucket2', 'us-east-1': 'bucket1' },
    };
    expect(compareRegistryRecords(record1, record2)).toEqual([]);
  });

  it('detects when bucketOverrides values differ', () => {
    const record1: RegistryRecord = { ...baseRecord, bucketOverrides: { 'us-east-1': 'bucket1' } };
    const record2: RegistryRecord = { ...baseRecord, bucketOverrides: { 'us-east-1': 'bucket2' } };
    const diffs = compareRegistryRecords(record1, record2);
    expect(diffs.some((d) => d.field === 'bucketOverrides')).toBe(true);
  });

  it('detects ownerAccountId difference', () => {
    const other: RegistryRecord = { ...baseRecord, ownerAccountId: '999999999999' };
    const diffs = compareRegistryRecords(baseRecord, other);
    expect(diffs.some((d) => d.field === 'ownerAccountId')).toBe(true);
  });
});
