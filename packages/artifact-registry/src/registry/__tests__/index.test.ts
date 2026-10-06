import * as registry from '../index';
import type { RegionBucket, RegistryConfig, RegistryLocation, RegistryRecord } from '../index';

/**
 * Pins the surface of the `/registry` subpath, which construct libraries import: exactly the three
 * runtime names below and the four types. An extra export would pull more of the package into
 * every consumer's bundle. Types are erased at runtime, so they are pinned by compiling a typed
 * fixture that uses each of them.
 */
describe('registry index', () => {
  it('exports exactly the registry functions', () => {
    expect(Object.keys(registry).sort()).toEqual([
      'buildArtifactBucketName',
      'parseRegistryRecord',
      'registryRecordKey',
    ]);
  });

  it('exports the four registry types', () => {
    const location: RegistryLocation = { bucketBase: 'example-artifacts', project: 'example' };
    const config: RegistryConfig = { ...location, regions: ['eu-west-1'] };
    const record: RegistryRecord = { ...config, schemaVersion: 1, ownerAccountId: '123456789012' };
    const regionBucket: RegionBucket = { region: 'eu-west-1', bucketName: registry.buildArtifactBucketName(record, 'eu-west-1') };

    expect(regionBucket.bucketName).toBe('example-artifacts-eu-west-1');
  });
});
