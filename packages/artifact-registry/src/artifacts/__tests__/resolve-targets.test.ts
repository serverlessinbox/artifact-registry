import { resolveTargets } from '../resolve-targets';
import type { S3ArtifactEntry, S3WorkspaceConfig } from '../workspace-config';

/**
 * Pins where an artifact entry is published: its own `regions` beat its `zone`, which beats the
 * registry's regions, and every destination takes its bucket name from the registry lookup, so a
 * bucket override reaches the zone-selected region too. A wrong destination uploads an artifact to
 * a region whose readers never look for it.
 */
describe('resolveTargets', () => {
  const config: S3WorkspaceConfig = {
    registry: {
      bucketBase: 'example-artifacts',
      project: 'example',
      regions: ['eu-west-1', 'eu-central-1'],
      bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' },
    },
    type: 'package',
    name: 'example',
    artifacts: [],
  };

  function entry(overrides: Partial<S3ArtifactEntry>): S3ArtifactEntry {
    return { source: 's', objectName: 'o.zip', ...overrides };
  }

  it('publishes to the registry regions when the entry names neither regions nor a zone', () => {
    expect(resolveTargets(config, entry({}))).toEqual([
      { region: 'eu-west-1', bucketName: 'example-artifacts-eu-west-1' },
      { region: 'eu-central-1', bucketName: 'example-artifacts-eu-central-1' },
    ]);
  });

  it('publishes a regional zone entry to the registry regions', () => {
    expect(resolveTargets(config, entry({ zone: 'regional' })).map(target => target.region)).toEqual(['eu-west-1', 'eu-central-1']);
  });

  it('publishes an edge zone entry to us-east-1 under its overridden bucket', () => {
    expect(resolveTargets(config, entry({ zone: 'edge' }))).toEqual([
      { region: 'us-east-1', bucketName: 'example-artifacts-use1-7f3a' },
    ]);
  });

  it('prefers the entry regions over its zone', () => {
    expect(resolveTargets(config, entry({ zone: 'edge', regions: ['eu-central-1'] }))).toEqual([
      { region: 'eu-central-1', bucketName: 'example-artifacts-eu-central-1' },
    ]);
  });
});
