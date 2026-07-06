/**
 * Unit tests for TrackResolver CloudFormation custom resource handler (plan-a, stack-self-update).
 *
 * Tests the real, exported `handleRequest` from `track-resolver-handler.ts` with mocked S3 (not a
 * hand-copied reimplementation) -- verifying the pure stateless resolver:
 * - Create/Update: byte-identical, resolve the one track-scoped pointer, template exact keys via
 *   buildArtifactKey, return `{ PhysicalResourceId, Data }`.
 * - Delete: dispatched on `RequestType`, zero-AWS-call no-op, no `Data`.
 * - Track validation: regex fail-closed before any S3 call (no granularity -- accepts both `v1`
 *   and `v1.2` shapes; the major-vs-major+minor policy lives only in the CDK `CfnParameter`).
 * - Single package: one `Package` string in `ResourceProperties`, not a `Packages` array.
 *
 * `ARTIFACT_BUCKET_BASE`/`AWS_REGION`/`PROJECT` are set in `env-setup.ts` (jest `setupFiles`)
 * before this module is first required, since the handler reads them as module-level constants at
 * load time. `PROJECT` is base config (constant for the whole stack) -- it is no longer a
 * `ResourceProperties` field, so tests below never pass a `Project` per-event; the env-setup value
 * (`serverlessinbox`, matching `DEFAULT_PROJECT`) applies to every case.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { buildArtifactKey } from '../../utils/artifact-key';
import { trackResolverObjectAttrName, trackResolverVersionAttrName } from '../attr-name';
import { handleRequest } from '../track-resolver-handler';
import type { LatestStablePointer } from '../../utils/types';

const s3Mock = mockClient(S3Client);

const BUCKET = 'mailbox-artifacts-us-east-1';

interface ExtraProps {
  distTag?: string;
}

function createEvent(track: string, pkg: string, extra?: ExtraProps) {
  return {
    RequestType: 'Create',
    ResourceProperties: { Track: track, Package: pkg, DistTag: extra?.distTag },
  };
}

function updateEvent(track: string, pkg: string, extra?: ExtraProps) {
  return {
    RequestType: 'Update',
    ResourceProperties: { Track: track, Package: pkg, DistTag: extra?.distTag },
  };
}

function deleteEvent(track: string, pkg: string) {
  return {
    RequestType: 'Delete',
    ResourceProperties: { Track: track, Package: pkg },
  };
}

describe('TrackResolver handler (pure stateless resolver)', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('Response shape', () => {
    it('returns a static PhysicalResourceId and wraps resolved attrs in Data', async () => {
      const pointer: LatestStablePointer = {
        version: '1.2.3',
        publishedAt: '2026-07-05T00:00:00Z',
        objects: [{ name: 'lambdas/admin-api.zip', kind: 'lambda-zip' }],
      };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(result.PhysicalResourceId).toBe('TrackResolver');
      expect(result.Data).toBeDefined();
      expect(result.Data!['ver_mailbox_go']).toBe('1.2.3');
      expect(result.Data!['obj_mailbox_go_lambdas_admin_api_zip']).toContain('/releases/v1.2.3/');
    });

    it('returns the identical PhysicalResourceId on Create and Update (never a replacement)', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const createResult = await handleRequest(createEvent('v1', 'mailbox-go'));
      const updateResult = await handleRequest(updateEvent('v1', 'mailbox-go'));

      expect(createResult.PhysicalResourceId).toBe('TrackResolver');
      expect(updateResult.PhysicalResourceId).toBe('TrackResolver');
    });
  });

  describe('Pointer parse', () => {
    it('should return empty Data when the pointer is malformed JSON', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from('not valid json') } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(Object.keys(result.Data ?? {})).toHaveLength(0);
    });

    it('should return empty Data when the pointer is missing a version', async () => {
      const pointer = { publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(Object.keys(result.Data ?? {})).toHaveLength(0);
    });

    it('should return empty Data when the pointer version is unparseable (non-semver)', async () => {
      const pointer = { version: 'not-a-semver', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(Object.keys(result.Data ?? {})).toHaveLength(0);
    });
  });

  describe('Key templating via buildArtifactKey', () => {
    it('should use release-pointer for pointer-file key, defaulting Project/DistTag', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      await handleRequest(createEvent('v1', 'mailbox-go'));

      const expectedKey = buildArtifactKey('package', 'mailbox-go', {
        type: 'release-pointer',
        track: 'v1',
      });
      expect(expectedKey).toBe('serverlessinbox/packages/mailbox-go/releases/v1/stable.json');

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Bucket).toBe(BUCKET);
      expect(calls[0].args[0].input.Key).toBe(expectedKey);
    });

    it('should use an explicit DistTag (beta) in the pointer-file key', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0-beta.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      await handleRequest(createEvent('v1', 'mailbox-go', { distTag: 'beta' }));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/v1/beta.json');
    });

    it('should use an explicit DistTag (calendar) in the pointer-file key, with a v1.2 track', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0-calendar.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      await handleRequest(createEvent('v1.2', 'mailbox-webmail-ui', { distTag: 'calendar' }));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('serverlessinbox/packages/mailbox-webmail-ui/releases/v1.2/calendar.json');
    });

    it('should use release spec for object keys, exact string match', async () => {
      const pointer: LatestStablePointer = {
        version: '2.5.1',
        publishedAt: '2026-07-05T00:00:00Z',
        objects: [
          { name: 'lambdas/admin-api.zip', kind: 'lambda-zip' },
          { name: 'ui/app.zip', kind: 'ui-bundle' },
        ],
      };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(result.Data!['obj_mailbox_go_lambdas_admin_api_zip']).toBe(
        'serverlessinbox/packages/mailbox-go/releases/v2.5.1/lambdas/admin-api.zip',
      );
      expect(result.Data!['obj_mailbox_go_ui_app_zip']).toBe(
        'serverlessinbox/packages/mailbox-go/releases/v2.5.1/ui/app.zip',
      );
    });

    it('should use the PROJECT env var (base config) in both the pointer key and the object keys', async () => {
      const pointer: LatestStablePointer = {
        version: '1.0.0',
        publishedAt: '2026-07-05T00:00:00Z',
        objects: [{ name: 'lambdas/admin-api.zip', kind: 'lambda-zip' }],
      };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Key).toBe('serverlessinbox/packages/mailbox-go/releases/v1/stable.json');
      expect(result.Data!['obj_mailbox_go_lambdas_admin_api_zip']).toBe(
        'serverlessinbox/packages/mailbox-go/releases/v1.0.0/lambdas/admin-api.zip',
      );
    });
  });

  describe('Track validation (regex fail-closed, no granularity)', () => {
    it('should accept a major-only track (v1)', async () => {
      const pointer: LatestStablePointer = { version: '1.0.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
      expect(result.Data!['ver_mailbox_go']).toBe('1.0.0');
    });

    it('should accept a major.minor track (v1.2)', async () => {
      const pointer: LatestStablePointer = { version: '1.2.0', publishedAt: '2026-07-05T00:00:00Z' };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1.2', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
      expect(result.Data!['ver_mailbox_go']).toBe('1.2.0');
    });

    it('should reject a malformed track (bad prefix) without S3 calls', async () => {
      await expect(handleRequest(createEvent('bad', 'mailbox-go'))).rejects.toThrow('bad track');
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    });

    it('should reject tracks without a version prefix', async () => {
      await expect(handleRequest(createEvent('1', 'mailbox-go'))).rejects.toThrow('bad track');
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    });

    it('should reject a track with too many segments (v1.2.3)', async () => {
      await expect(handleRequest(createEvent('v1.2.3', 'mailbox-go'))).rejects.toThrow('bad track');
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    });

    it('should reject an empty track without S3 calls', async () => {
      await expect(handleRequest(createEvent('', 'mailbox-go'))).rejects.toThrow('bad track');
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    });

    it('should validate identically on Update as on Create', async () => {
      await expect(handleRequest(updateEvent('bad', 'mailbox-go'))).rejects.toThrow('bad track');
      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
    });
  });

  describe('Delete (no-op, dispatched on RequestType)', () => {
    it('should no-op on Delete with zero AWS calls, regardless of Track/Package', async () => {
      const result = await handleRequest(deleteEvent('v1', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
      expect(result).toEqual({ PhysicalResourceId: 'TrackResolver' });
    });

    it('should no-op on Delete even with an invalid Track (never validates on Delete)', async () => {
      const result = await handleRequest(deleteEvent('not-a-track', 'mailbox-go'));

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
      expect(result.PhysicalResourceId).toBe('TrackResolver');
    });
  });

  describe('Attr-name transforms', () => {
    it('should sanitize package+object names to attr names', async () => {
      const pointer: LatestStablePointer = {
        version: '1.0.0',
        publishedAt: '2026-07-05T00:00:00Z',
        objects: [{ name: 'lambdas/admin-api.zip', kind: 'lambda-zip' }],
      };
      s3Mock.on(GetObjectCommand).resolves({ Body: Buffer.from(JSON.stringify(pointer)) } as any);

      const result = await handleRequest(createEvent('v1', 'mailbox-go'));

      const objAttr = trackResolverObjectAttrName('mailbox-go', 'lambdas/admin-api.zip');
      expect(objAttr).toBe('obj_mailbox_go_lambdas_admin_api_zip');
      expect(result.Data![objAttr]).toBeDefined();

      const verAttr = trackResolverVersionAttrName('mailbox-go');
      expect(verAttr).toBe('ver_mailbox_go');
      expect(result.Data![verAttr]).toBe('1.0.0');
    });
  });
});
