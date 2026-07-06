/**
 * Unit tests for `deriveTrack` and `buildTrackResolverProperties` (plan-a, stack-self-update).
 *
 * Pure data builders -- no S3, no CDK. Covers:
 * - `deriveTrack`: exact `v{major}`/`v{major}.{minor}` outputs from a semver version + granularity,
 *   both bare (`1.4.2`) and `v`-prefixed (`v1.4.2`) inputs, and throwing on garbage.
 * - `buildTrackResolverProperties`: derives `Track` via `deriveTrack`, defaults `DistTag`
 *   (`stable`) when omitted, and never emits a `Project` field (that is base config, supplied to
 *   the handler via the `PROJECT` env var instead -- see `track-resolver-handler.ts`).
 */

import { DEFAULT_DIST_TAG } from '../../utils/artifact-key';
import { buildTrackResolverProperties, deriveTrack } from '../build-properties';

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

describe('buildTrackResolverProperties', () => {
  it('derives Track (major) and applies the DistTag default when omitted', () => {
    const result = buildTrackResolverProperties({
      package: 'mailbox-go',
      version: '1.4.2',
      granularity: 'major',
    });

    expect(result).toEqual({
      Package: 'mailbox-go',
      Track: 'v1',
      DistTag: DEFAULT_DIST_TAG,
    });
  });

  it('derives Track (minor) and applies the exact string default (stable)', () => {
    const result = buildTrackResolverProperties({
      package: 'mailbox-go',
      version: '1.4.2',
      granularity: 'minor',
    });

    expect(result).toEqual({
      Package: 'mailbox-go',
      Track: 'v1.4',
      DistTag: 'stable',
    });
  });

  it('passes through an explicit distTag verbatim', () => {
    const result = buildTrackResolverProperties({
      package: 'mailbox-webmail-ui',
      version: '1.2.9',
      granularity: 'minor',
      distTag: 'beta',
    });

    expect(result).toEqual({
      Package: 'mailbox-webmail-ui',
      Track: 'v1.2',
      DistTag: 'beta',
    });
  });

  it('never includes a Project field', () => {
    const result = buildTrackResolverProperties({
      package: 'mailbox-go',
      version: '2.0.0',
      granularity: 'major',
    });

    expect(result).not.toHaveProperty('Project');
    expect(Object.keys(result).sort()).toEqual(['DistTag', 'Package', 'Track']);
  });
});
