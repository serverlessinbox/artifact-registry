/**
 * Round-trip tests asserting writer and reader agree on S3 key shape and pointer body shape.
 *
 * Each test here uses the real writer function (not a hand-mocked reimplementation), so a future
 * writer/reader drift fails a test instead of hiding silently: an object written under a key the
 * reader never looks up would be missing at read time with no error at write time.
 */

import semver from 'semver';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Uploader } from '../uploader';
import { buildArtifactKey } from '../../artifacts/artifact-key';
import { buildReleasePrefix, buildChannelPrefix } from '../../artifacts/artifact-target';

const s3Mock = mockClient(S3Client);

describe('writer/reader round trips', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('pointer key: writer key == reader key', () => {
    it('writeVersionPointers writes the exact key buildArtifactKey/handleRequest read for (major track)', async () => {
      const uploader = new S3Uploader(new S3Client({ region: 'us-east-1' }));
      const version = new semver.SemVer('2.5.0');

      await uploader.writeVersionPointers({ package: { bucketName: 'some-bucket', artifactType: 'package', name: 'mailbox-go' }, objects: [{ name: 'a.zip' }] }, version);

      const writerKeys = s3Mock.commandCalls(PutObjectCommand).map(c => c.args[0].input.Key);
      const readerKey = buildArtifactKey('package', 'mailbox-go', { type: 'release-pointer', track: 'v2' });
      expect(writerKeys).toContain(readerKey);
    });

    it('writeVersionPointers writes the exact key buildArtifactKey/handleRequest read for (major.minor track)', async () => {
      const uploader = new S3Uploader(new S3Client({ region: 'us-east-1' }));
      const version = new semver.SemVer('2.5.0');

      await uploader.writeVersionPointers({ package: { bucketName: 'some-bucket', artifactType: 'package', name: 'mailbox-go' }, objects: [{ name: 'a.zip' }] }, version);

      const writerKeys = s3Mock.commandCalls(PutObjectCommand).map(c => c.args[0].input.Key);
      const readerKey = buildArtifactKey('package', 'mailbox-go', { type: 'release-pointer', track: 'v2.5' });
      expect(writerKeys).toContain(readerKey);
    });
  });

  describe('channel: uploadChannel key falls under loadChannelVersions prefix', () => {
    it('the key uploadChannel writes starts with buildChannelPrefix (the prefix loadChannelVersions lists)', async () => {
      const uploader = new S3Uploader(new S3Client({ region: 'us-east-1' }));
      // uploadChannel -> upload() reads a real file from disk; use this test file itself.
      await uploader.uploadChannel({ bucketName: 'some-bucket', artifactType: 'package', name: 'mailbox-go' }, 'dev', 'lambdas/admin-api.zip', __filename);

      const key = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Key;
      if (key === undefined) {
        throw new Error('PutObjectCommand was sent without a Key');
      }
      const prefix = buildChannelPrefix('package', 'mailbox-go', 'dev');

      expect(key.startsWith(`${prefix}/`)).toBe(true);
      expect(key).toBe(`${prefix}/lambdas/admin-api.zip`);
    });
  });

  describe('release: writer key == reader key', () => {
    it('the release object key (buildArtifactKey, what the writer uploads to) falls under buildReleasePrefix (what the reader lists)', () => {
      const version = new semver.SemVer('3.1.4');
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
