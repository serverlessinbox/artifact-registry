/**
 * Exports for the TrackResolver feature's pure remainder.
 *
 * The CFN custom-resource handler, `buildTrackResolverProperties`, `TRACK_RESOLVER_VERSION_ATTR`,
 * and the esbuild inline-handler bundle moved to `@serverlessinbox/mailbox-cdk-shared`
 * (stack-self-update, phase A cleanup) -- this package must stay pure (no CDK/CFN knowledge).
 * `deriveTrack` (pure version→track math, Phase B) stays here.
 */

export { deriveTrack } from './derive-track';
