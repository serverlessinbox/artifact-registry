import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { loadTrackVersions } from '../load-track';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'us-east-1' });

function pointerBody(text: string) {
  return { transformToString: jest.fn().mockResolvedValue(text) };
}

/**
 * Pins that `loadTrackVersions` rejects a malformed pointer with an error naming
 * the pointer, instead of continuing with an undefined version or object list.
 */
describe('loadTrackVersions validates release pointers', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('rejects a pointer without a version', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('{"publishedAt": "2026-01-01T00:00:00Z"}') });

    await expect(loadTrackVersions(client, { track: 'v1', location: { bucketBase: 'bucket', project: 'p' }, artifactType: 'package', packages: { p: 'us-east-1' } }))
      .rejects.toThrow(/release pointer .*version/);
  });
});
