/**
 * Pins the exact `v{major}` / `v{major}.{minor}` strings `deriveTrack` returns, for plain semver
 * versions and with prerelease suffixes, and that malformed or `v`-prefixed input throws. The result
 * is used as a track segment of S3 keys, so a changed format points at different objects.
 */

import { deriveTrack } from '../derive-track';

describe('deriveTrack', () => {
  it('derives a major track from a bare semver version (1.4.2 + major -> v1)', () => {
    expect(deriveTrack('1.4.2', 'major')).toBe('v1');
  });

  it('derives a major.minor track from a bare semver version (1.4.2 + minor -> v1.4)', () => {
    expect(deriveTrack('1.4.2', 'minor')).toBe('v1.4');
  });

  it('rejects a v-prefixed version, because versions never carry a v', () => {
    expect(() => deriveTrack('v1.2.3', 'major')).toThrow('deriveTrack: not a valid semver version: v1.2.3');
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
