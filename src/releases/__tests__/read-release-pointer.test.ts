/**
 * Pins the Bucket and Key `readReleasePointer` requests from S3 (global and track-scoped, default
 * and custom bucket base and project), and that a missing or unreadable pointer is an error. A
 * changed Bucket or Key reads a different object than the one the pointer writer produced.
 */

import { readReleasePointer } from '../read-release-pointer';
import { NoSuchKey, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'us-east-1' });

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
          { name: 'lambdas/mailbox-go.zip' },
        ],
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      const result = await readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1');

      expect(result).toEqual(pointer);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('mailbox-artifacts-us-east-1');
      expect(command.input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/stable.json');
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

      const result = await readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1', {
        track: 'v1',
      });

      expect(result).toEqual(pointer);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/v1/stable.json');
    });

    it('handles major.minor track correctly', async () => {
      const pointer = { version: '2.3.5', publishedAt: '2026-07-08T14:00:00Z', objects: [{ name: 'a.zip' }] };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer(client, 'mailbox-cdk', 'stable', 'us-east-1', {
        track: 'v2.3',
      });

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('serverlessinbox/packages/mailbox-cdk/releases/v2.3/stable.json');
    });
  });

  describe('default values (bucketBase, project)', () => {
    it('reflects default bucketBase and project in Bucket and Key', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z', objects: [{ name: 'a.zip' }] };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('mailbox-artifacts-us-east-1');
      expect(command.input.Key).toMatch(/^serverlessinbox\/packages/);
    });

    it('uses custom bucketBase and project when provided', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z', objects: [{ name: 'a.zip' }] };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1', {
        bucketBase: 'custom-bucket',
        project: 'acme',
      });

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('custom-bucket-us-east-1');
      expect(command.input.Key).toBe('acme/packages/mailbox-go/releases/stable.json');
    });
  });

  describe('missing pointer', () => {
    it('throws "object not found" when NoSuchKey is thrown', async () => {
      s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'Not Found', $metadata: {} }));

      await expect(readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1')).rejects.toThrow(
        'release pointer s3://mailbox-artifacts-us-east-1/serverlessinbox/packages/mailbox-go/releases/stable.json: object not found',
      );
    });
  });

  describe('error handling - rethrows other errors', () => {
    it('throws on access denied error', async () => {
      const error = new Error('AccessDenied');
      s3Mock.on(GetObjectCommand).rejects(error);

      await expect(
        readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1')
      ).rejects.toThrow('AccessDenied');
    });

    it('throws on invalid JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('{ invalid json'),
      });

      await expect(
        readReleasePointer(client, 'mailbox-go', 'stable', 'us-east-1')
      ).rejects.toThrow(/release pointer s3:\/\/mailbox-artifacts-us-east-1\/.*: not valid JSON/);
    });
  });
});
