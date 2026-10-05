import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, NoSuchKey, AccessDenied } from '@aws-sdk/client-s3';
import type { RegistryRecord } from '../registry-record';
import { registryRecordKey, parseRegistryRecord, loadRegistryRecord, compareRegistryRecords } from '../registry-record';

function createMockStream(text: string) {
  return {
    transformToString: jest.fn().mockResolvedValue(text),
  };
}

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'eu-west-1' });

describe('registry-record', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('registryRecordKey', () => {
    it('builds the record key from project', () => {
      expect(registryRecordKey('serverlessinbox')).toBe('serverlessinbox/registry.json');
      expect(registryRecordKey('example')).toBe('example/registry.json');
    });
  });

  describe('parseRegistryRecord', () => {
    it('parses a valid registry record', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1', 'us-east-1'],
        ownerAccountId: '123456789012',
      });
      const record = parseRegistryRecord(text, 'test-source');
      expect(record.schemaVersion).toBe(1);
      expect(record.bucketBase).toBe('artifacts');
      expect(record.project).toBe('example');
      expect(record.regions).toEqual(['eu-west-1', 'us-east-1']);
      expect(record.ownerAccountId).toBe('123456789012');
    });

    it('rejects invalid JSON', () => {
      expect(() => parseRegistryRecord('not json', 'test-source')).toThrow(
        'registry record test-source: not valid JSON'
      );
    });

    it('rejects wrong schemaVersion', () => {
      const text = JSON.stringify({
        schemaVersion: 2,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        ownerAccountId: '123456789012',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects missing ownerAccountId', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects malformed ownerAccountId', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        ownerAccountId: 'not-a-number',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects empty regions array', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: [],
        ownerAccountId: '123456789012',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('includes source in error message', () => {
      const text = JSON.stringify({ invalid: 'data' });
      expect(() => parseRegistryRecord(text, 'my-source.json')).toThrow('my-source.json');
    });

    it('accepts valid bucketOverrides', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        bucketOverrides: { 'us-east-1': 'custom-bucket' },
        ownerAccountId: '123456789012',
      });
      const record = parseRegistryRecord(text, 'test-source');
      expect(record.bucketOverrides).toEqual({ 'us-east-1': 'custom-bucket' });
    });
  });

  describe('loadRegistryRecord', () => {
    it('loads and parses a valid record from S3', async () => {
      const recordBody = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'serverlessinbox',
        regions: ['eu-west-1'],
        ownerAccountId: '123456789012',
      });

      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(recordBody) });

      const record = await loadRegistryRecord(client, {
        bucketBase: 'artifacts',
        project: 'serverlessinbox',
      }, 'eu-west-1');

      expect(record.schemaVersion).toBe(1);
      expect(record.bucketBase).toBe('artifacts');
      expect(record.project).toBe('serverlessinbox');
      expect(record.ownerAccountId).toBe('123456789012');
    });

    it('throws with proper message for NoSuchKey', async () => {
      s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'Not found', $metadata: {} }));

      await expect(
        loadRegistryRecord(client, {
          bucketBase: 'artifacts',
          project: 'serverlessinbox',
        }, 'eu-west-1')
      ).rejects.toThrow('registry record s3://artifacts-eu-west-1/serverlessinbox/registry.json: missing or not readable');
    });

    it('throws with proper message for AccessDenied', async () => {
      s3Mock.on(GetObjectCommand).rejects(new AccessDenied({ message: 'Access Denied', $metadata: {} }));

      await expect(
        loadRegistryRecord(client, {
          bucketBase: 'artifacts',
          project: 'serverlessinbox',
        }, 'eu-west-1')
      ).rejects.toThrow('registry record s3://artifacts-eu-west-1/serverlessinbox/registry.json: missing or not readable');
    });

    it('throws with proper message for empty body', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream('') });

      await expect(
        loadRegistryRecord(client, {
          bucketBase: 'artifacts',
          project: 'serverlessinbox',
        }, 'eu-west-1')
      ).rejects.toThrow('registry record s3://artifacts-eu-west-1/serverlessinbox/registry.json: missing or not readable');
    });

    it('uses bucket override when provided', async () => {
      const recordBody = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'serverlessinbox',
        regions: ['us-east-1'],
        bucketOverrides: { 'us-east-1': 'custom-artifacts-bucket' },
        ownerAccountId: '123456789012',
      });

      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(recordBody) });

      const recordClient = new S3Client({ region: 'us-east-1' });
      const record = await loadRegistryRecord(recordClient, {
        bucketBase: 'artifacts',
        project: 'serverlessinbox',
        bucketOverrides: { 'us-east-1': 'custom-artifacts-bucket' },
      }, 'us-east-1');

      expect(record.bucketBase).toBe('artifacts');
      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Bucket).toBe('custom-artifacts-bucket');
    });

    it('throws with proper message for invalid JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream('not json') });

      await expect(
        loadRegistryRecord(client, {
          bucketBase: 'artifacts',
          project: 'serverlessinbox',
        }, 'eu-west-1')
      ).rejects.toThrow('registry record s3://artifacts-eu-west-1/serverlessinbox/registry.json: not valid JSON');
    });

    it('throws with proper message for malformed record', async () => {
      const recordBody = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'serverlessinbox',
        regions: [],
        ownerAccountId: '123456789012',
      });

      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(recordBody) });

      await expect(
        loadRegistryRecord(client, {
          bucketBase: 'artifacts',
          project: 'serverlessinbox',
        }, 'eu-west-1')
      ).rejects.toThrow('registry record s3://artifacts-eu-west-1/serverlessinbox/registry.json:');
    });
  });

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
});
