/**
 * Pins how `ArtifactResolver` picks the region and bucket of each package (explicit `region`, else
 * the zone table, else the deployment region; the bucket always through the override-aware lookup)
 * and that `resolve` and `getUrl` carry the same pinned S3 version ID. A wrong region reads a
 * package from a bucket that does not hold it; a URL without the version ID can fetch a different
 * object than the one `resolve` pinned.
 */

import { ArtifactResolver } from '../artifact-resolver';
import type { ArtifactResolverFactoryOptions } from '../artifact-resolver';
import type { ParsedArtifactVersions } from '../artifact-versions';
import type { RegistryLocation } from '../../registry';

const location: RegistryLocation = {
  bucketBase: 'example-artifacts',
  project: 'example',
  bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' },
};

const versions: ParsedArtifactVersions = {
  packages: {
    'edge-pkg': { version: '1.2.3', zone: 'edge' },
    'regional-pkg': { version: '1.2.3', zone: 'regional' },
    'pinned-pkg': { version: '1.2.3', zone: 'edge', region: 'eu-central-1' },
    'channel-pkg': { version: '1.2.3', zone: 'regional', channel: 'dev' },
  },
};

function createResolver(extra: Partial<ArtifactResolverFactoryOptions> = {}): ArtifactResolver {
  return new ArtifactResolver({ versions, location, deploymentRegion: 'eu-west-1', ...extra });
}

describe('ArtifactResolver region and bucket', () => {
  it('resolves an edge package to the zone table region, through the override of that region', () => {
    const resolver = createResolver();

    expect(resolver.resolve('edge-pkg', 'a.zip').bucket).toBe('example-artifacts-use1-7f3a');
    expect(resolver.getUrl('edge-pkg', 'a.zip')).toBe(
      'https://example-artifacts-use1-7f3a.s3.us-east-1.amazonaws.com/example/packages/edge-pkg/releases/v1.2.3/a.zip',
    );
    expect(resolver.getArn('edge-pkg', 'a.zip')).toBe(
      'arn:aws:s3:::example-artifacts-use1-7f3a/example/packages/edge-pkg/releases/v1.2.3/a.zip',
    );
  });

  it('resolves a regional package to the deployment region bucket', () => {
    const resolver = createResolver();

    expect(resolver.resolve('regional-pkg', 'a.zip').bucket).toBe('example-artifacts-eu-west-1');
    expect(resolver.getUrl('regional-pkg', 'a.zip')).toContain('https://example-artifacts-eu-west-1.s3.eu-west-1.amazonaws.com/');
  });

  it('lets an explicit entry region beat its zone', () => {
    const resolver = createResolver();

    expect(resolver.resolve('pinned-pkg', 'a.zip').bucket).toBe('example-artifacts-eu-central-1');
    expect(resolver.getUrl('pinned-pkg', 'a.zip')).toContain('.s3.eu-central-1.amazonaws.com/');
  });

  it('resolves under the channel prefix when the entry names a channel', () => {
    expect(createResolver().resolve('channel-pkg', 'a.zip').key).toBe('example/packages/channel-pkg/channels/dev/a.zip');
  });

  it('exposes the location it was constructed with', () => {
    expect(createResolver().getLocation()).toBe(location);
  });

  it('throws for a package the versions file does not list', () => {
    expect(() => createResolver().resolve('unknown-pkg', 'a.zip')).toThrow("No resolved data for package 'unknown-pkg'");
  });
});

describe('ArtifactResolver S3 version ID', () => {
  const key = 'example/packages/regional-pkg/releases/v1.2.3/a.zip';

  it('adds the pinned version ID of the key to resolve()', () => {
    const resolver = createResolver({ s3VersionMap: { [key]: 'v-abc' } });

    expect(resolver.resolve('regional-pkg', 'a.zip').versionId).toBe('v-abc');
  });

  it('carries the same pinned version ID in getUrl()', () => {
    const resolver = createResolver({ s3VersionMap: { [key]: 'v-abc' } });

    expect(resolver.getUrl('regional-pkg', 'a.zip')).toBe(
      `https://example-artifacts-eu-west-1.s3.eu-west-1.amazonaws.com/${key}?versionId=v-abc`,
    );
  });

  it('leaves the URL without a version query when the key is not pinned', () => {
    const resolver = createResolver({ s3VersionMap: { 'other/key': 'v-abc' } });

    expect(resolver.getUrl('regional-pkg', 'a.zip')).not.toContain('versionId');
  });
});
