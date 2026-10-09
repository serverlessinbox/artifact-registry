import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { readReleasePointer } from '../read-release-pointer';
import type { RegistryLocation } from '../../registry';
import { s3Body } from '../../__tests__/s3-body';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'us-east-1' });
const location: RegistryLocation = { bucketBase: 'bucket', project: 'p' };

/**
 * Pins that `readReleasePointer` rejects a malformed pointer with an error naming
 * the pointer, instead of continuing with an undefined version or object list.
 */
describe('readReleasePointer validates release pointers', () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it('rejects a pointer without publishedAt', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: s3Body('{"version": "1.0.0"}') });

    await expect(readReleasePointer(client, location, 'example-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*publishedAt/);
  });

  it('rejects a pointer without objects', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: s3Body('{"version": "1.0.0", "publishedAt": "2026-01-01T00:00:00Z"}') });

    await expect(readReleasePointer(client, location, 'example-go', 'stable', 'us-east-1')).rejects.toThrow(/release pointer .*\.objects/);
  });
});
