/**
 * Derive the track segment (`v{major}` or `v{major}.{minor}`) from a semver version string.
 * `granularity` picks how wide the track is: `major` yields `v1`, `minor` yields `v1.4`. Accepts
 * both bare (`1.4.2`) and already-`v`-prefixed (`v1.4.2`) inputs and ignores any prerelease or build
 * suffix. Throws on anything that doesn't parse as `[v]major.minor.patch[-prerelease/+build]`.
 */
export function deriveTrack(version: string, granularity: 'major' | 'minor'): string {
  const match = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`deriveTrack: not a valid semver version: ${version}`);
  }
  const [, major, minor] = match;
  return granularity === 'major' ? `v${major}` : `v${major}.${minor}`;
}