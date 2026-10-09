import { App } from 'aws-cdk-lib';
import { ArtifactZone, type ArtifactPin, type RegistryLocation } from '../artifact-resolution';
import { PinnedArtifactResolver } from '../pinned-artifact-resolver';

/**
 * Pins what a consumer of `PinnedArtifactResolver` relies on to find its artifacts: the bucket, key,
 * URL and ARN a pin resolves to, the region rules of the zones, the failure for a package without a
 * pin, the validation of pins read from a shipped file, and how CDK context overrides the shipped
 * defaults. A wrong bucket or key here deploys a Lambda from an object that does not exist, and an
 * override that replaces too much or too little silently changes what a development stack deploys.
 */

const LOCATION: RegistryLocation = { bucketBase: 'acme-artifacts', project: 'acme' };
const DEPLOYMENT_REGION = 'eu-west-1';
const API_ZIP = 'lambdas/api.zip';
const RELEASE_KEY = 'acme/packages/mailbox-go/releases/v1.2.3/lambdas/api.zip';
const ARTIFACTS_KEY = 'test:artifacts';
const OBJECT_VERSIONS_KEY = 'test:object_versions';

function resolverOf(
  packages: { [packageName: string]: ArtifactPin },
  objectVersionIds?: { [s3Key: string]: string },
): PinnedArtifactResolver {
  return new PinnedArtifactResolver({
    packages,
    location: LOCATION,
    deploymentRegion: DEPLOYMENT_REGION,
    objectVersionIds,
  });
}

describe('PinnedArtifactResolver resolution', () => {
  it('resolves a release pin to the deployment region bucket and the release prefix', () => {
    const resolver = resolverOf({ 'mailbox-go': { zone: ArtifactZone.REGIONAL, version: '1.2.3' } });

    expect(resolver.resolve('mailbox-go', API_ZIP)).toEqual({ bucket: 'acme-artifacts-eu-west-1', key: RELEASE_KEY });
    expect(resolver.getVersion('mailbox-go')).toBe('1.2.3');
  });

  it('resolves a channel pin under the channel prefix and reports the channel name as its version', () => {
    const resolver = resolverOf({ 'mailbox-go': { zone: ArtifactZone.REGIONAL, channel: 'dev' } });

    expect(resolver.resolve('mailbox-go', API_ZIP).key).toBe('acme/packages/mailbox-go/channels/dev/lambdas/api.zip');
    expect(resolver.getVersion('mailbox-go')).toBe('dev');
  });

  it('reads an edge pin from the us-east-1 bucket whatever the deployment region is', () => {
    const resolver = resolverOf({ 'mailbox-cdk-edge': { zone: ArtifactZone.EDGE, version: '1.2.3' } });

    expect(resolver.resolve('mailbox-cdk-edge', API_ZIP).bucket).toBe('acme-artifacts-us-east-1');
    expect(resolver.getUrl('mailbox-cdk-edge', API_ZIP)).toBe(
      'https://acme-artifacts-us-east-1.s3.us-east-1.amazonaws.com/acme/packages/mailbox-cdk-edge/releases/v1.2.3/lambdas/api.zip',
    );
  });

  it('lets an explicit pin region win over the zone', () => {
    const resolver = resolverOf({
      'mailbox-cdk-edge': { zone: ArtifactZone.EDGE, version: '1.2.3', region: 'eu-central-1' },
    });

    expect(resolver.resolve('mailbox-cdk-edge', API_ZIP).bucket).toBe('acme-artifacts-eu-central-1');
  });

  it('throws for a package that has no pin', () => {
    const resolver = resolverOf({});

    expect(() => resolver.resolve('unpinned', API_ZIP)).toThrow("No resolved data for package 'unpinned'");
  });

  it.each([
    ['neither', { zone: ArtifactZone.REGIONAL }],
    ['both', { zone: ArtifactZone.REGIONAL, version: '1.2.3', channel: 'dev' }],
  ])('throws naming the package when a pin sets %s of version and channel', (_case, pin) => {
    expect(() => resolverOf({ 'mailbox-go': pin })).toThrow(/package 'mailbox-go' must set exactly one of/);
  });

  describe('with object version IDs', () => {
    const resolver = resolverOf(
      { 'mailbox-go': { zone: ArtifactZone.REGIONAL, version: '1.2.3' } },
      { [RELEASE_KEY]: 'ver-7' },
    );

    it('adds the version ID to resolve and to the URL of a listed key only', () => {
      expect(resolver.resolve('mailbox-go', API_ZIP)).toEqual({
        bucket: 'acme-artifacts-eu-west-1',
        key: RELEASE_KEY,
        versionId: 'ver-7',
      });
      expect(resolver.getUrl('mailbox-go', API_ZIP)).toBe(
        `https://acme-artifacts-eu-west-1.s3.eu-west-1.amazonaws.com/${RELEASE_KEY}?versionId=ver-7`,
      );
      expect(resolver.resolve('mailbox-go', 'lambdas/other.zip').versionId).toBeUndefined();
    });

    it('builds the ARN from bucket and key without the version ID', () => {
      expect(resolver.getArn('mailbox-go', API_ZIP)).toBe(`arn:aws:s3:::acme-artifacts-eu-west-1/${RELEASE_KEY}`);
    });
  });
});

describe('PinnedArtifactResolver.parsePins', () => {
  const SOURCE = '/pkg/artifact-versions.json';

  it('parses a valid file into pins', () => {
    const json = JSON.stringify({
      'mailbox-go': { zone: 'regional', version: '1.2.3' },
      'mailbox-cdk-edge': { zone: 'edge', channel: 'dev', region: 'us-east-1' },
    });

    expect(PinnedArtifactResolver.parsePins(json, SOURCE)).toEqual({
      'mailbox-go': { zone: 'regional', version: '1.2.3' },
      'mailbox-cdk-edge': { zone: 'edge', channel: 'dev', region: 'us-east-1' },
    });
  });

  it.each([
    ['malformed JSON', '{not json', ['not valid JSON']],
    ['a missing zone', '{"mailbox-go":{"version":"1.2.3"}}', ['mailbox-go', 'zone']],
    ['an unknown zone', '{"mailbox-go":{"zone":"moon","version":"1.2.3"}}', ['mailbox-go', 'zone']],
    ['a non-string version', '{"mailbox-go":{"zone":"regional","version":1}}', ['mailbox-go', 'version']],
    ['neither version nor channel', '{"mailbox-go":{"zone":"regional"}}', ['mailbox-go', 'exactly one of']],
    [
      'both version and channel',
      '{"mailbox-go":{"zone":"regional","version":"1.2.3","channel":"dev"}}',
      ['mailbox-go', 'exactly one of'],
    ],
  ])('throws naming the source and the offending entry for %s', (_case, json, fragments) => {
    expect.hasAssertions();
    try {
      PinnedArtifactResolver.parsePins(json, SOURCE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain(SOURCE);
      for (const fragment of fragments) {
        expect(message).toContain(fragment);
      }
      return;
    }
    throw new Error('parsePins did not throw');
  });
});

describe('PinnedArtifactResolver.fromContext', () => {
  const DEFAULT_LOCATION: RegistryLocation = {
    bucketBase: 'default-base',
    project: 'default-project',
    bucketOverrides: { 'eu-west-1': 'default-override' },
  };
  const DEFAULT_PINS: { [packageName: string]: ArtifactPin } = {
    alpha: { zone: ArtifactZone.REGIONAL, version: '1.0.0' },
    beta: { zone: ArtifactZone.REGIONAL, version: '2.0.0' },
  };

  function fromContext(context: { [key: string]: unknown }): PinnedArtifactResolver {
    return PinnedArtifactResolver.fromContext(new App({ context }), {
      defaultPins: DEFAULT_PINS,
      defaultLocation: DEFAULT_LOCATION,
      artifactsContextKey: ARTIFACTS_KEY,
      objectVersionsContextKey: OBJECT_VERSIONS_KEY,
      deploymentRegion: DEPLOYMENT_REGION,
    });
  }

  it('holds exactly the default pins and location when no context is set', () => {
    const resolver = fromContext({});

    expect(resolver.location).toEqual(DEFAULT_LOCATION);
    expect(resolver.getVersion('alpha')).toBe('1.0.0');
    expect(resolver.getVersion('beta')).toBe('2.0.0');
    expect(() => resolver.getVersion('gamma')).toThrow("No resolved data for package 'gamma'");
  });

  it('replaces only the default pin of the package the context names', () => {
    const resolver = fromContext({
      [ARTIFACTS_KEY]: { packages: { alpha: { zone: 'regional', channel: 'dev' } } },
    });

    expect(resolver.getVersion('alpha')).toBe('dev');
    expect(resolver.getVersion('beta')).toBe('2.0.0');
  });

  it('adds a context pin for a package without a default pin', () => {
    const resolver = fromContext({
      [ARTIFACTS_KEY]: { packages: { gamma: { zone: 'edge', version: '3.0.0' } } },
    });

    expect(resolver.resolve('gamma', API_ZIP)).toEqual({
      bucket: 'default-base-us-east-1',
      key: 'default-project/packages/gamma/releases/v3.0.0/lambdas/api.zip',
    });
    expect(resolver.getVersion('alpha')).toBe('1.0.0');
  });

  it.each([
    ['bucketBase', { bucketBase: 'ctx-base' }, { ...DEFAULT_LOCATION, bucketBase: 'ctx-base' }],
    ['project', { project: 'ctx-project' }, { ...DEFAULT_LOCATION, project: 'ctx-project' }],
    ['bucketOverrides', { bucketOverrides: { 'eu-west-1': 'ctx-override' } }, { ...DEFAULT_LOCATION, bucketOverrides: { 'eu-west-1': 'ctx-override' } }],
  ])('overrides only the %s location field', (_field, context, expected) => {
    expect(fromContext({ [ARTIFACTS_KEY]: context }).location).toEqual(expected);
  });

  it('applies object version IDs from context', () => {
    const resolver = fromContext({ [OBJECT_VERSIONS_KEY]: { 'default-project/packages/alpha/releases/v1.0.0/lambdas/api.zip': 'ver-9' } });

    expect(resolver.resolve('alpha', API_ZIP).versionId).toBe('ver-9');
  });

  it.each([
    ['a context pin without a zone', ARTIFACTS_KEY, { packages: { alpha: { version: '1.0.0' } } }, 'zone'],
    ['a context pin with both version and channel', ARTIFACTS_KEY, { packages: { alpha: { zone: 'regional', version: '1.0.0', channel: 'dev' } } }, 'exactly one of'],
    ['an invalid artifacts value', ARTIFACTS_KEY, 'not-an-object', 'not-an-object'],
    ['an invalid object versions value', OBJECT_VERSIONS_KEY, { 'some/key': 7 }, 'some/key'],
  ])('throws naming key and value for %s', (_case, key, value, fragment) => {
    expect.hasAssertions();
    try {
      fromContext({ [key]: value });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain(`"${key}"`);
      expect(message).toContain(fragment);
      return;
    }
    throw new Error('fromContext did not throw');
  });
});
