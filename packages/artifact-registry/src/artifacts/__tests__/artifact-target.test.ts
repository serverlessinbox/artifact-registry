import { buildArtifactBucketName } from '../artifact-target';

/**
 * Pins the one place a bucket name is formed: a region's override wins over the `{bucketBase}-{region}`
 * convention, and only for the region it names. A wrong name here writes to, or reads from, a bucket
 * the registry does not own.
 */
describe('buildArtifactBucketName', () => {
  it('names the bucket {bucketBase}-{region} when the location has no override', () => {
    expect(buildArtifactBucketName({ bucketBase: 'example-artifacts', project: 'example' }, 'eu-west-1'))
      .toBe('example-artifacts-eu-west-1');
  });

  it('uses the override of the region it names', () => {
    const location = { bucketBase: 'example-artifacts', project: 'example', bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' } };

    expect(buildArtifactBucketName(location, 'us-east-1')).toBe('example-artifacts-use1-7f3a');
  });

  it('keeps the convention name for a region without an override', () => {
    const location = { bucketBase: 'example-artifacts', project: 'example', bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' } };

    expect(buildArtifactBucketName(location, 'eu-west-1')).toBe('example-artifacts-eu-west-1');
  });
});
