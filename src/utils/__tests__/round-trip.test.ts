/**
 * Round-trip tests asserting writer and reader agree on S3 key shape and pointer body shape.
 *
 * This class of test was entirely missing before -- which is why the real blocker it guards
 * (`writeVersionPointers` never wrote `objects[]`, so `handleRequest` resolved a version but zero
 * object keys against a real published pointer) went unnoticed: every existing test either drove
 * the writer only (key-shape assertions) or the reader only (hand-constructed pointer bodies).
 *
 * Each test here uses the real writer and/or real reader function (not a hand-mocked
 * reimplementation), so a future writer/reader drift fails a test instead of hiding silently.
 */

import semver from 'semver';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Uploader } from '../uploader';
import { buildArtifactKey } from '../artifact-key';
import { buildReleasePrefix, buildChannelPrefix } from '../artifact-target';
import { handleRequest, TRACK_RESOLVER_VERSION_ATTR } from '../../track-resolver/track-resolver-handler';

const s3Mock = mockClient(S3Client);

/**
 * Wrap a Buffer in an object with transformToString() method to match AWS SDK v3 GetObject Body API.
 */
function mockS3Body(buffer: any) {
  return {
    transformToString: async () => buffer.toString('utf-8'),
  };
}

// Matches ARTIFACT_BUCKET_BASE/AWS_REGION set in track-resolver/__tests__/env-setup.ts (a global
// jest setupFiles entry -- applies to every test file in the suite).
const RESOLVER_BUCKET = 'mailbox-artifacts-us-east-1';

describe('writer/reader round trips', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('pointer round trip: a real writer-produced body drives the resolver', () => {
    it('writeVersionPointers -> handleRequest yields the resolved version', async () => {
      const uploader = new S3Uploader({});
      const version = semver.parse('1.2.3')!;

      // Real writer call -- this is the exact path publish-release-cmd.ts / s3-artifact-plugin.ts
      // drive in production.
      await uploader.writeVersionPointers(RESOLVER_BUCKET, 'package', 'mailbox-go', version, [
        { name: 'lambdas/admin-api.zip', kind: 'lambda-zip' },
      ]);

      const puts = s3Mock.commandCalls(PutObjectCommand);
      const v1Key = buildArtifactKey('package', 'mailbox-go', { type: 'release-pointer', track: 'v1' });
      const v1Put = puts.find(c => c.args[0].input.Key === v1Key);
      expect(v1Put).toBeDefined();
      const writtenBody = v1Put!.args[0].input.Body as string;

      // Feed the real writer output into the real reader (handleRequest), not a hand-built pointer.
      s3Mock.reset();
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(writtenBody)) } as any);

      const result = await handleRequest({
        RequestType: 'Create',
        ResourceProperties: { Track: 'v1', Package: 'mailbox-go' },
      });

      expect(result.Data![TRACK_RESOLVER_VERSION_ATTR]).toBe('1.2.3');
      expect(Object.keys(result.Data ?? {})).toEqual([TRACK_RESOLVER_VERSION_ATTR]);
    });

    it('writeVersionPointers with no objects (default []) round-trips to resolved version', async () => {
      const uploader = new S3Uploader({});
      const version = semver.parse('4.0.0')!;

      await uploader.writeVersionPointers(RESOLVER_BUCKET, 'package', 'mailbox-webmail-ui', version);

      const puts = s3Mock.commandCalls(PutObjectCommand);
      const v4Key = buildArtifactKey('package', 'mailbox-webmail-ui', { type: 'release-pointer', track: 'v4' });
      const writtenBody = puts.find(c => c.args[0].input.Key === v4Key)!.args[0].input.Body as string;

      s3Mock.reset();
      s3Mock.on(GetObjectCommand).resolves({ Body: mockS3Body(Buffer.from(writtenBody)) } as any);

      const result = await handleRequest({
        RequestType: 'Create',
        ResourceProperties: { Track: 'v4', Package: 'mailbox-webmail-ui' },
      });

      // Version resolves; just the version attribute.
      expect(result.Data![TRACK_RESOLVER_VERSION_ATTR]).toBe('4.0.0');
      expect(Object.keys(result.Data ?? {})).toEqual([TRACK_RESOLVER_VERSION_ATTR]);
    });
  });

  describe('pointer key: writer key == reader key', () => {
    it('writeVersionPointers writes the exact key buildArtifactKey/handleRequest read for (major track)', async () => {
      const uploader = new S3Uploader({});
      const version = semver.parse('2.5.0')!;

      await uploader.writeVersionPointers('some-bucket', 'package', 'mailbox-go', version, []);

      const writerKeys = s3Mock.commandCalls(PutObjectCommand).map(c => c.args[0].input.Key);
      const readerKey = buildArtifactKey('package', 'mailbox-go', { type: 'release-pointer', track: 'v2' });
      expect(writerKeys).toContain(readerKey);
    });

    it('writeVersionPointers writes the exact key buildArtifactKey/handleRequest read for (major.minor track)', async () => {
      const uploader = new S3Uploader({});
      const version = semver.parse('2.5.0')!;

      await uploader.writeVersionPointers('some-bucket', 'package', 'mailbox-go', version, []);

      const writerKeys = s3Mock.commandCalls(PutObjectCommand).map(c => c.args[0].input.Key);
      const readerKey = buildArtifactKey('package', 'mailbox-go', { type: 'release-pointer', track: 'v2.5' });
      expect(writerKeys).toContain(readerKey);
    });
  });

  describe('channel: uploadChannel key falls under loadChannelVersions prefix', () => {
    it('the key uploadChannel writes starts with buildChannelPrefix (the prefix loadChannelVersions lists)', async () => {
      const uploader = new S3Uploader({});
      // uploadChannel -> upload() reads a real file from disk; use this test file itself.
      await uploader.uploadChannel('some-bucket', 'package', 'mailbox-go', 'dev', 'lambdas/admin-api.zip', __filename);

      const key = s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input.Key as string;
      const prefix = buildChannelPrefix('package', 'mailbox-go', 'dev');

      expect(key.startsWith(`${prefix}/`)).toBe(true);
      expect(key).toBe(`${prefix}/lambdas/admin-api.zip`);
    });
  });

  describe('release: writer key == reader key', () => {
    it('the release object key (buildArtifactKey, what the writer uploads to) falls under buildReleasePrefix (what the reader lists)', () => {
      const version = semver.parse('3.1.4')!;
      const writerKey = buildArtifactKey('package', 'mailbox-go', {
        type: 'release',
        version,
        objectName: 'lambdas/admin-api.zip',
      });
      const readerPrefix = buildReleasePrefix('package', 'mailbox-go', '3.1.4');

      expect(writerKey.startsWith(`${readerPrefix}/`)).toBe(true);
      expect(writerKey).toBe(`${readerPrefix}/lambdas/admin-api.zip`);
    });
  });
});
