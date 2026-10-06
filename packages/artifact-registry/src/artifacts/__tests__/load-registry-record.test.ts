import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, NoSuchKey, AccessDenied } from '@aws-sdk/client-s3';
import { loadRegistryRecord } from '../load-registry-record';

function createMockStream(text: string) {
  return {
    transformToString: jest.fn().mockResolvedValue(text),
  };
}

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'eu-west-1' });

/**
 * Pins how the registry record is read from S3: every unreadable shape (missing, denied, empty)
 * reports "missing or not readable" with the bucket and key, and the location's bucket override
 * decides which bucket is read.
 */
describe('loadRegistryRecord', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

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
