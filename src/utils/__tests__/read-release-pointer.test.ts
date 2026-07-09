/**
 * Unit tests for `readReleasePointer` (stack-self-update, Phase B).
 *
 * Uses aws-sdk-client-mock to assert S3 client behavior, specifically:
 * - the Bucket and Key passed to GetObjectCommand
 * - that key construction via buildReleasePointerKey matches the request
 * - error handling for NoSuchKey vs. other errors
 */

import { readReleasePointer } from '../read-release-pointer';
import { NoSuchKey, S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

const s3Mock = mockClient(S3Client);

// Helper to create a mock stream
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
          { name: 'lambdas/mailbox-go.zip', kind: 'lambda-zip' as const },
        ],
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      const result = await readReleasePointer('mailbox-go', 'stable', 'us-east-1');

      expect(result).toEqual(pointer);

      // Assert the S3 request: bucket should be '{bucketBase}-{region}', key should be global
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
      };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      const result = await readReleasePointer('mailbox-go', 'stable', 'us-east-1', {
        track: 'v1',
      });

      expect(result).toEqual(pointer);

      // Assert key includes track segment
      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/v1/stable.json');
    });

    it('handles major.minor track correctly', async () => {
      const pointer = { version: '2.3.5', publishedAt: '2026-07-08T14:00:00Z' };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer('mailbox-cdk', 'stable', 'us-east-1', {
        track: 'v2.3',
      });

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Key).toBe('serverlessinbox/packages/mailbox-cdk/releases/v2.3/stable.json');
    });
  });

  describe('default values (bucketBase, project)', () => {
    it('reflects default bucketBase and project in Bucket and Key', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z' };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer('mailbox-go', 'stable', 'us-east-1');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      // Default bucketBase is 'mailbox-artifacts'
      expect(command.input.Bucket).toBe('mailbox-artifacts-us-east-1');
      // Default project is 'serverlessinbox'
      expect(command.input.Key).toMatch(/^serverlessinbox\/packages/);
    });

    it('uses custom bucketBase and project when provided', async () => {
      const pointer = { version: '1.0.0', publishedAt: '2026-07-08T00:00:00Z' };

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(JSON.stringify(pointer)),
      });

      await readReleasePointer('mailbox-go', 'stable', 'us-east-1', {
        bucketBase: 'custom-bucket',
        project: 'acme',
      });

      const calls = s3Mock.commandCalls(GetObjectCommand);
      const command = calls[0].args[0];
      expect(command.input.Bucket).toBe('custom-bucket-us-east-1');
      expect(command.input.Key).toBe('acme/packages/mailbox-go/releases/stable.json');
    });
  });

  describe('NoSuchKey handling - returns undefined', () => {
    it('returns undefined when NoSuchKey is thrown', async () => {
      s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'Not Found' } as any));

      const result = await readReleasePointer('mailbox-go', 'stable', 'us-east-1');

      expect(result).toBeUndefined();
    });

    it('returns undefined when error with name=NoSuchKey is thrown', async () => {
      const error = new Error('NoSuchKey');
      (error as any).name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(error);

      const result = await readReleasePointer('mailbox-go', 'stable', 'us-east-1');

      expect(result).toBeUndefined();
    });

    it('returns undefined when response Body is null', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: null,
      });

      const result = await readReleasePointer('mailbox-go', 'stable', 'us-east-1');

      expect(result).toBeUndefined();
    });
  });

  describe('error handling - rethrows non-NoSuchKey errors', () => {
    it('throws on access denied error', async () => {
      const error = new Error('AccessDenied');
      s3Mock.on(GetObjectCommand).rejects(error);

      await expect(
        readReleasePointer('mailbox-go', 'stable', 'us-east-1')
      ).rejects.toThrow('AccessDenied');
    });

    it('throws on invalid JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('{ invalid json'),
      });

      await expect(
        readReleasePointer('mailbox-go', 'stable', 'us-east-1')
      ).rejects.toThrow();
    });
  });
});
