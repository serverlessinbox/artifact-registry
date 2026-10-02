import { GetObjectCommand, NoSuchKey, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { loadReleasePointer } from '../release-pointer';

const s3Mock = mockClient(S3Client);

function respondWith(text: string): void {
  s3Mock.on(GetObjectCommand).resolves({ Body: { transformToString: jest.fn().mockResolvedValue(text) } });
}

/**
 * Pins that `loadReleasePointer` returns a valid pointer and otherwise throws a message naming the
 * pointer's S3 location and the problem (missing object, empty body, bad JSON, or the failing
 * field). A broken pointer fails the caller instead of resolving to nothing; other S3 errors must
 * pass through unchanged.
 */
describe('loadReleasePointer returns the validated pointer or throws a message naming the pointer and the problem', () => {
  const client = new S3Client({ region: 'us-east-1' });
  const source = 's3://bkt/k/v1/stable.json';

  beforeEach(() => {
    s3Mock.reset();
  });

  it('returns a valid pointer with its objects', async () => {
    const pointer = { version: '1.2.3', publishedAt: '2026-01-01T00:00:00Z', objects: [{ name: 'a.zip' }] };
    respondWith(JSON.stringify(pointer));

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json')).resolves.toEqual(pointer);
  });

  it('throws "object not found" when S3 reports NoSuchKey', async () => {
    s3Mock.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'Not Found', $metadata: {} }));

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(`release pointer ${source}: object not found`);
  });

  it('throws "empty body" when the response has no body', async () => {
    s3Mock.on(GetObjectCommand).resolves({});

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(`release pointer ${source}: empty body`);
  });

  it('throws "empty body" when the body is an empty string', async () => {
    respondWith('');

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(`release pointer ${source}: empty body`);
  });

  it('throws "not valid JSON" when the body is not JSON', async () => {
    respondWith('{ invalid json');

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(`release pointer ${source}: not valid JSON`);
  });

  it('throws the field error when objects is missing', async () => {
    respondWith('{"version": "1.2.3", "publishedAt": "2026-01-01T00:00:00Z"}');

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(/^release pointer s3:\/\/bkt\/k\/v1\/stable\.json: \.objects/);
  });

  it('throws the field error when objects is empty', async () => {
    respondWith('{"version": "1.2.3", "publishedAt": "2026-01-01T00:00:00Z", "objects": []}');

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(/^release pointer s3:\/\/bkt\/k\/v1\/stable\.json: \.objects/);
  });

  it('throws the field error when version is not a string', async () => {
    respondWith('{"version": 5, "publishedAt": "2026-01-01T00:00:00Z", "objects": [{"name": "a.zip"}]}');

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json'))
      .rejects.toThrow(/^release pointer s3:\/\/bkt\/k\/v1\/stable\.json: \.version/);
  });

  it('propagates other S3 errors unchanged', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('AccessDenied'));

    await expect(loadReleasePointer(client, 'bkt', 'k/v1/stable.json')).rejects.toThrow(/^AccessDenied$/);
  });
});
