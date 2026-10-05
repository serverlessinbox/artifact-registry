import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3ArtifactRegistry } from '../artifact-registry';
import { loadPrereleaseVersions } from '../load-prerelease';
import { loadTrackVersions } from '../load-track';
import { readReleasePointer } from '../read-release-pointer';
import type { RegistryLocation } from '../../artifacts/registry-location';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'us-east-1' });
const location: RegistryLocation = { bucketBase: 'bucket', project: 'p' };

function pointerBody(text: string) {
  return { transformToString: jest.fn().mockResolvedValue(text) };
}

/**
 * Pins that every reader of release pointers (`S3ArtifactRegistry.resolve`, `loadTrackVersions`,
 * `loadPrereleaseVersions`, `readReleasePointer`) rejects a malformed pointer with an error naming
 * the pointer, instead of continuing with an undefined version or object list.
 */
describe('release pointers read from S3 are validated', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('S3ArtifactRegistry.resolve (track target)', () => {
    const registry = new S3ArtifactRegistry(location, client);

    it('rejects a pointer whose version is not a string', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"version": 5}') });

      await expect(registry.resolve('package', 'n', { kind: 'track', track: 'v1' }, 'o.zip', 'us-east-1'))
        .rejects.toThrow(/release pointer .*version/);
    });

    it('rejects a pointer response without a body', async () => {
      s3Mock.on(GetObjectCommand).resolves({});

      await expect(registry.resolve('package', 'n', { kind: 'track', track: 'v1' }, 'o.zip', 'us-east-1'))
        .rejects.toThrow(/release pointer s3:\/\/bucket-us-east-1\/.*: empty body/);
    });
  });

  describe('loadTrackVersions', () => {
    it('rejects a pointer without a version', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"publishedAt": "2026-01-01T00:00:00Z"}') });

      await expect(loadTrackVersions(client,{ track: 'v1', location, artifactType: 'package', packages: { p: 'us-east-1' } }))
        .rejects.toThrow(/release pointer .*version/);
    });
  });

  describe('loadPrereleaseVersions', () => {
    it('rejects a pointer without a version', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"publishedAt": "2026-01-01T00:00:00Z"}') });

      await expect(loadPrereleaseVersions(client,{ prereleaseTag: 'beta', track: 'v1', location, artifactType: 'package', packages: { p: 'us-east-1' } }))
        .rejects.toThrow(/release pointer .*version/);
    });
  });

  describe('readReleasePointer', () => {
    it('rejects a pointer without publishedAt', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"version": "1.0.0"}') });

      await expect(readReleasePointer(client, location, 'mailbox-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*publishedAt/);
    });

    it('rejects a pointer without objects', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"version": "1.0.0", "publishedAt": "2026-01-01T00:00:00Z"}') });

      await expect(readReleasePointer(client, location, 'mailbox-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*\.objects/);
    });
  });
});
