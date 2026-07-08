/**
 * Round-trip tests asserting writer and reader agree on S3 key shape and pointer body shape.
 *
 * Each test here uses the real writer function (not a hand-mocked reimplementation), so a future
 * writer/reader drift fails a test instead of hiding silently.
 *
 * NOTE: the writer→real-`handleRequest`-reader round-trip tests that used to live here (feeding a
 * real writer-produced pointer body into the real CFN handler) were removed when the handler moved
 * to `@serverlessinbox/mailbox-cdk-shared` (stack-self-update, phase A cleanup) -- artifact-registry
 * must stay pure (no CDK/CFN knowledge), and that package has no jest/test infra yet to host them.
 * This is a real coverage gap (the exact writer/reader-key-shape-drift class of bug this file's
 * tests were written to catch) -- flagged for the owner to decide whether to add test infra to
 * mailbox-cdk-shared to restore it there.
 */

import semver from 'semver';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Uploader } from '../uploader';
import { buildArtifactKey } from '../artifact-key';
import { buildReleasePrefix, buildChannelPrefix } from '../artifact-target';

const s3Mock = mockClient(S3Client);

describe('writer/reader round trips', () => {
  beforeEach(() => {
    s3Mock.reset();
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
