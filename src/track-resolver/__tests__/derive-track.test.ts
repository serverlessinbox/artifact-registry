/**
 * Unit tests for `deriveTrack` (plan-a, stack-self-update, Phase B).
 *
 * Pure version→track math -- no S3, no CDK. Covers exact `v{major}`/`v{major}.{minor}` outputs
 * from a semver version + granularity, both bare (`1.4.2`) and `v`-prefixed (`v1.4.2`) inputs, and
 * throwing on garbage. Split out of the former `build-properties.test.ts` when the CFN-specific
 * `buildTrackResolverProperties` tests moved to `@serverlessinbox/mailbox-cdk-shared` along with the
 * builder itself.
 */

import { deriveTrack } from '../derive-track';

describe('deriveTrack', () => {
  it('derives a major track from a bare semver version (1.4.2 + major -> v1)', () => {
    expect(deriveTrack('1.4.2', 'major')).toBe('v1');
  });

  it('derives a major.minor track from a bare semver version (1.4.2 + minor -> v1.4)', () => {
    expect(deriveTrack('1.4.2', 'minor')).toBe('v1.4');
  });

  it('handles an already-v-prefixed version the same way', () => {
    expect(deriveTrack('v1.4.2', 'major')).toBe('v1');
    expect(deriveTrack('v1.4.2', 'minor')).toBe('v1.4');
  });

  it('handles prerelease/build metadata suffixes', () => {
    expect(deriveTrack('2.0.0-beta.1', 'major')).toBe('v2');
    expect(deriveTrack('2.0.0-beta.1', 'minor')).toBe('v2.0');
  });

  it('throws on a garbage version string', () => {
    expect(() => deriveTrack('not-a-semver', 'major')).toThrow();
    expect(() => deriveTrack('', 'major')).toThrow();
    expect(() => deriveTrack('1.2', 'major')).toThrow();
  });
});
