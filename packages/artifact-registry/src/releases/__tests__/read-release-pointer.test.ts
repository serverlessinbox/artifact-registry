/**
 * Pins the Bucket and Key `readReleasePointer` requests from S3 (global and track-scoped, derived
 * from the registry location, with a per-region bucket override replacing the convention name), and
 * that a missing or unreadable pointer is an error. A changed Bucket or Key reads a different object
 * than the one the pointer writer produced.
 */

import { readReleasePointer } from '../read-release-pointer';
import type { RegistryLocation } from '../../artifacts/registry-location';
import { NoSuchKey, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'eu-west-1' });
const location: RegistryLocation = { bucketBase: 'example-artifacts', project: 'example' };

function createMockStream(text: string) {
  return {
    transformToString: jest.fn().mockResolvedValue(text),
  };
}

describe('readReleasePointer', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('global read (no track)', () => {
    it('returns parsed pointer for global read and asserts correct Bucket and Key', async () => {
      const pointer = {
        version: '1.2.3',
        publishedAt: '2026-07-08T10:00:00Z',
        objects: [
          { name: 'lambdas/example-go.zip' },
        ],
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      const result = await readReleasePointer(client, location, 'example-go', 'stable', 'eu-west-1');

      expect(result).toEqual(pointer);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('example-artifacts-eu-west-1');
      expect(command.input.Key).toBe('example/packages/example-go/releases/stable.json');
    });
  });

  describe('track-scoped read', () => {
    it('returns parsed pointer for track-scoped read and asserts correct Key format', async () => {
      const pointer = {
        version: '1.5.2',
        publishedAt: '2026-07-08T14:00:00Z',
        objects: [{ name: 'a.zip' }],
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      const result = await readReleasePointer(client, location, 'example-go', 'stable', 'eu-west-1', 'v1');

      expect(result).toEqual(pointer);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('example/packages/example-go/releases/v1/stable.json');
    });

    it('handles major.minor track correctly', async () => {
      const pointer = { version: '2.3.5', publishedAt: '2026-07-08T14:00:00Z', objects: [{ name: 'a.zip' }] };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer(client, location, 'example-cdk', 'stable', 'eu-west-1', 'v2.3');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('example/packages/example-cdk/releases/v2.3/stable.json');
    });
  });

  describe('registry location', () => {
    it('takes the bucket base and project from the location', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z', objects: [{ name: 'a.zip' }] };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer(client, { bucketBase: 'custom-bucket', project: 'acme' }, 'example-go', 'stable', 'eu-west-1');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('custom-bucket-eu-west-1');
      expect(command.input.Key).toBe('acme/packages/example-go/releases/stable.json');
    });

    it('reads from the override bucket of the region that has one, and the convention bucket elsewhere', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z', objects: [{ name: 'a.zip' }] };
      s3Mock.on(GetObjectCommand).resolves({ Body: createMockStream(JSON.stringify(pointer)) });
      const overridden: RegistryLocation = { ...location, bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' } };

      await readReleasePointer(client, overridden, 'example-go', 'stable', 'us-east-1');
      await readReleasePointer(client, overridden, 'example-go', 'stable', 'eu-west-1');

      const buckets = s3Mock.commandCalls(GetObjectCommand).map((call) => call.args[0].input.Bucket);
      expect(buckets).toEqual(['example-artifacts-use1-7f3a', 'example-artifacts-eu-west-1']);
    });
  });

  describe('missing pointer', () => {
    it('throws "object not found" when NoSuchKey is thrown', async () => {
      s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'Not Found', $metadata: {} }));

      await expect(readReleasePointer(client, location, 'example-go', 'stable', 'eu-west-1')).rejects.toThrow(
        'release pointer s3://example-artifacts-eu-west-1/example/packages/example-go/releases/stable.json: object not found',
      );
    });
  });

  describe('error handling - rethrows other errors', () => {
    it('throws on access denied error', async () => {
      const error = new Error('AccessDenied');
      s3Mock.on(GetObjectCommand).rejects(error);

      await expect(
        readReleasePointer(client, location, 'example-go', 'stable', 'eu-west-1')
      ).rejects.toThrow('AccessDenied');
    });

    it('throws on invalid JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('{ invalid json'),
      });

      await expect(
        readReleasePointer(client, location, 'example-go', 'stable', 'eu-west-1')
      ).rejects.toThrow(/release pointer s3:\/\/example-artifacts-eu-west-1\/.*: not valid JSON/);
    });
  });
});
