/**
 * Pure version→track math for the TrackResolver feature (plan-a, stack-self-update, Phase B).
 *
 * Split out of the former `build-properties.ts` when the CFN-specific `buildTrackResolverProperties`
 * builder (and the handler it serves) moved to `@serverlessinbox/mailbox-cdk-shared` -- that package
 * owns the CDK/CFN wiring; artifact-registry stays pure (no CDK/CFN knowledge). This module has
 * zero `aws-cdk-lib`/construct imports and stays here.
 */

/**
 * Derive the track segment (`v{major}` or `v{major}.{minor}`) from a semver version string.
 * Accepts both bare (`1.4.2`) and already-`v`-prefixed (`v1.4.2`) inputs. Throws on anything that
 * doesn't parse as `[v]major.minor.patch[-prerelease/+build]`.
 */
export function deriveTrack(version: string, granularity: 'major' | 'minor'): string {
  const match = /^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) {
    throw new Error(`deriveTrack: not a valid semver version: ${version}`);
  }
  const [, major, minor] = match;
  return granularity === 'major' ? `v${major}` : `v${major}.${minor}`;
}