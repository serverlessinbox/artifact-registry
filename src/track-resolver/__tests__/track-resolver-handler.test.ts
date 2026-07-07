/**
 * Unit tests for TrackResolver CloudFormation custom resource handler (plan-a, stack-self-update).
 *
 * Tests the real, exported `handleRequest` from `track-resolver-handler.ts` with mocked S3 (not a
 * hand-copied reimplementation) -- verifying the minimal resolver:
 * - Create/Update: resolve the one track-scoped pointer, extract and return version.
 * - Delete: dispatched on `RequestType`, zero-AWS-call no-op, no `Data`.
 * - Single package: one `Package` string in `ResourceProperties`.
 *
 * `ARTIFACT_BUCKET_BASE`/`AWS_REGION`/`PROJECT` are set in `env-setup.ts` (jest `setupFiles`)
 * before this module is first required, since the handler reads them as module-level constants at
 * load time. `PROJECT` is base config (constant for the whole stack).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { buildReleasePointerKey } from '../../utils/artifact-key';
import { TRACK_RESOLVER_VERSION_ATTR, handleRequest } from '../track-resolver-handler';
import type { LatestStablePointer } from '../../utils/types';

const s3Mock = mockClient(S3Client);

const BUCKET = 'mailbox-artifacts-us-east-1';

/**
 * Wrap a Buffer in an object with transformToString() method to match AWS SDK v3 GetObject Body API.
 */
function mockS3Body(buffer: any) {
  return {
    transformToString: async () => buffer.toString('utf-8'),
  };
}

interface ExtraProps {
  distTag?: string;
}

function createEvent(track: string, pkg: string, extra?: ExtraProps) {
  return {
    RequestType: 'Create',
    ResourceProperties: { Track: track, Package: pkg, DistTag: extra?.distTag, Region: 'us-east-1' },
  };
}

function updateEvent(track: string, pkg: string, extra?: ExtraProps) {
  return {
    RequestType: 'Update',
    ResourceProperties: { Track: track, Package: pkg, DistTag: extra?.distTag, Region: 'us-east-1' },
  };
}

function deleteEvent(track: string, pkg: string) {
  return {
    RequestType: 'Delete',
    ResourceProperties: { Track: track, Package: pkg, Region: 'us-east-1' },
  };
}

describe('TrackResolver handler (minimal version resolver)', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Response shape', () => {
    it('returns a static PhysicalResourceId and the resolved version in Data', async () => {
      const pointer: LatestStablePointer = {
        version: '1.2.3',
        publishedAt: '2026-07-05T00:00:00Z',
      };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(result.PhysicalResourceId).toBe('TrackResolver');
      expect(result.Data).toBeDefined();
      expect(result.Data![TRACK_RESOLVER_VERSION_ATTR]).toBe('1.2.3');
    });

    it('returns the identical PhysicalResourceId on Create and Update (never a replacement)', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      const createResult = await handleRequest(createEvent('v1', 'mailbox-go'));
      const updateResult = await handleRequest(updateEvent('v1', 'mailbox-go'));

      expect(createResult.PhysicalResourceId).toBe('TrackResolver');
      expect(updateResult.PhysicalResourceId).toBe('TrackResolver');
    });
  });

  describe('Pointer parse', () => {
    it('should throw when the pointer is malformed JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from('not valid json')) } as any);

      await expect(handleRequest(createEvent('v1', 'mailbox-go'))).rejects.toThrow(
        'TrackResolver: pointer missing or has no version'
      );
    });

    it('should throw when the pointer is missing a version', async () => {
      const pointer = { publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      await expect(handleRequest(createEvent('v1', 'mailbox-go'))).rejects.toThrow(
        'TrackResolver: pointer missing or has no version'
      );
    });
  });

  describe('Pointer key templating', () => {
    it('should use buildReleasePointerKey for pointer file key, defaulting DistTag', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      await handleRequest(createEvent('v1', 'mailbox-go'));

      const expectedKey = buildReleasePointerKey('package', 'mailbox-go', { track: 'v1' });
      expect(expectedKey).toBe('serverlessinbox/packages/mailbox-go/releases/v1/stable.json');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Bucket).toBe(BUCKET);
      expect(calls[0].args[0].input.Key).toBe(expectedKey);
    });

    it('should use an explicit DistTag (beta) in the pointer-file key', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0-beta.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      await handleRequest(createEvent('v1', 'mailbox-go', { distTag: 'beta' }));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/v1/beta.json');
    });

    it('should use an explicit DistTag (calendar) with a v1.2 track', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0-calendar.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      await handleRequest(createEvent('v1.2', 'mailbox-webmail-ui', { distTag: 'calendar' }));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('serverlessinbox/packages/mailbox-webmail-ui/releases/v1.2/calendar.json');
    });
  });

  describe('Region-aware bucket resolution', () => {
    it('should use the Region from ResourceProperties to construct the S3 bucket name (edge case: us-east-1)', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      const event = {
        RequestType: 'Create',
        ResourceProperties: { Track: 'v1', Package: 'mailbox-cdk-edge', DistTag: 'stable', Region: 'us-east-1' },
      };

      await handleRequest(event);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Bucket).toBe('mailbox-artifacts-us-east-1');
    });

    it('should fall back to AWS_REGION env var if Region is not provided (back-compat)', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(JSON.stringify(pointer))) } as any);

      const event = {
        RequestType: 'Create',
        ResourceProperties: { Track: 'v1', Package: 'mailbox-go' },
      };

      await handleRequest(event);

      const calls = s3Mock.commandCalls(GetObjectCommand);
      // Should use us-east-1 from env-setup.ts or fall back to eu-west-1
      expect(calls[0].args[0].input.Bucket).toMatch(/^mailbox-artifacts-(us-east-1|eu-west-1)$/);
    });
  });

  describe('Delete (no-op, dispatched on RequestType)', () => {
    it('should no-op on Delete with zero AWS calls, regardless of Track/Package', async () => {
      const result = await handleRequest(deleteEvent('v1', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
      expect(result).toEqual({ PhysicalResourceId: 'TrackResolver' });
    });

    it('should no-op on Delete even with an invalid Track', async () => {
      const result = await handleRequest(deleteEvent('not-a-track', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
      expect(result.PhysicalResourceId).toBe('TrackResolver');
    });
  });
});
