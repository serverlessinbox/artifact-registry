import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
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
 * Pins that every reader of release pointers (`loadTrackVersions`,
 * `readReleasePointer`) rejects a malformed pointer with an error naming
 * the pointer, instead of continuing with an undefined version or object list.
 */
describe('release pointers read from S3 are validated', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  describe('loadTrackVersions', () => {
    it('rejects a pointer without a version', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"publishedAt": "2026-01-01T00:00:00Z"}') });

      await expect(loadTrackVersions(client,{ track: 'v1', location, artifactType: 'package', packages: { p: 'us-east-1' } }))
        .rejects.toThrow(/release pointer .*version/);
    });
  });

  describe('readReleasePointer', () => {
    it('rejects a pointer without publishedAt', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"version": "1.0.0"}') });

      await expect(readReleasePointer(client, location, 'example-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*publishedAt/);
    });

    it('rejects a pointer without objects', async () => {
      s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"version": "1.0.0", "publishedAt": "2026-01-01T00:00:00Z"}') });

      await expect(readReleasePointer(client, location, 'example-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*\.objects/);
    });
  });
});
