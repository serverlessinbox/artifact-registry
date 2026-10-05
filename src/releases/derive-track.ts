/**
 * Derive the track segment (`v{major}` or `v{major}.{minor}`) from a semver version string.
 * `granularity` picks how wide the track is: `major` yields `v1`, `minor` yields `v1.4`. A version
 * never carries a `v` (only track names do) and any prerelease or build suffix is ignored. Throws on
 * anything that doesn't parse as `major.minor.patch[-prerelease/+build]`, including a `v`-prefixed version.
 */
export function deriveTrack(version: string, granularity: 'major' | 'minor'): string {
  const match = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`deriveTrack: not a valid semver version: ${version}`);
  }
  const [, major, minor] = match;
  return granularity === 'major' ? `v${major}` : `v${major}.${minor}`;
}