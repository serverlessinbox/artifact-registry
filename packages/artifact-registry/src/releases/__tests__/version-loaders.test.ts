/**
 * Pins that the channel and track loaders request every bucket the override-aware lookup names for
 * the package's region: the override bucket for an overridden region, `{bucketBase}-{region}` elsewhere.
 * A retyped bucket template in a reader would skip the override and read a bucket that does not hold
 * the registry's objects.
 */

import { GetObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { loadChannelVersions } from '../load-channel';
import { loadTrackVersions } from '../load-track';
import type { RegistryLocation } from '../../artifacts/registry-location';

const s3Mock = mockClient(S3Client);
const client = new S3Client({ region: 'eu-west-1' });
const location: RegistryLocation = {
  bucketBase: 'example-artifacts',
  project: 'example',
  bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' },
};
const packages = { 'edge-pkg': 'us-east-1', 'regional-pkg': 'eu-west-1' };
const OVERRIDE_BUCKET = 'example-artifacts-use1-7f3a';
const CONVENTION_BUCKET = 'example-artifacts-eu-west-1';

function respondWithPointerAndListing(): void {
  const pointer = { version: '1.2.3', publishedAt: '2026-07-08T00:00:00Z', objects: [{ name: 'a.zip' }] };
  s3Mock.on(GetObjectCommand).resolves({ Body: { transformToString: jest.fn().mockResolvedValue(JSON.stringify(pointer)) } });
  s3Mock.on(ListObjectVersionsCommand).resolves({ Versions: [{ Key: 'some/key', VersionId: 'v1', IsLatest: true }] });
}

function pointerBuckets(): string[] {
  return s3Mock.commandCalls(GetObjectCommand).map((call) => call.args[0].input.Bucket ?? '').sort();
}

function listedBuckets(): string[] {
  return s3Mock.commandCalls(ListObjectVersionsCommand).map((call) => call.args[0].input.Bucket ?? '').sort();
}

describe('readers form buckets through the override-aware lookup', () => {
  beforeEach(() => {
    s3Mock.reset();
    respondWithPointerAndListing();
  });

  it('loadChannelVersions lists the override bucket for the overridden region', async () => {
    await loadChannelVersions(client, { artifactType: 'package', channel: 'dev', location, packages });

    expect(listedBuckets()).toEqual([CONVENTION_BUCKET, OVERRIDE_BUCKET]);
  });

  it('loadTrackVersions reads pointers and lists objects in the override bucket for the overridden region', async () => {
    await loadTrackVersions(client, { artifactType: 'package', track: 'v1', location, packages });

    expect(pointerBuckets()).toEqual([CONVENTION_BUCKET, OVERRIDE_BUCKET]);
    expect(listedBuckets()).toEqual([CONVENTION_BUCKET, OVERRIDE_BUCKET]);
  });

});
