/**
 * CDK-wiring helper for the TrackResolver custom resource (plan-a, stack-self-update).
 *
 * Pure data -- zero `aws-cdk-lib`/construct imports. `mailbox-cdk`'s construct calls this to build
 * the exact `ResourceProperties` object a `CfnCustomResource` should pass to the handler in
 * `track-resolver-handler.ts`; the handler and this function are the only two places that need to
 * agree on the property shape (`{ Package, Track, DistTag }`).
 *
 * `project` is NOT part of this shape: it is base config, constant for every lookup in a stack, so
 * it is set once as the resolver Lambda's `PROJECT` env var (read directly by the handler) rather
 * than passed per-`CfnCustomResource`. Callers here never parse S3 keys or construct track
 * segments themselves -- `deriveTrack`/`buildTrackResolverProperties` are the single source of the
 * `v{major}`/`v{major}.{minor}` track format, derived from a semver `version` + `granularity`.
 */

import { DEFAULT_DIST_TAG } from '../utils/artifact-key';

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

export interface TrackResolverPropertiesInput {
  /** Single package name to resolve, e.g. `mailbox-go`. Required -- one resolver per package. */
  package: string;
  /** Semver version string, e.g. `1.4.2`. Track is derived from this + `granularity`. Required. */
  version: string;
  /** Track granularity: `major` -> `v{major}`, `minor` -> `v{major}.{minor}`. Required. */
  granularity: 'major' | 'minor';
  /** Defaults to `stable`. */
  distTag?: string;
  /** AWS region of the artifact bucket for this package — `us-east-1` for edge-zone artifacts, the deployment region otherwise. Required. */
  region: string;
}

/**
 * Build the `CfnCustomResource` ResourceProperties object the TrackResolver handler expects.
 * Derives `Track` from `version`/`granularity` via `deriveTrack`; applies the same `stable`
 * default the handler itself falls back to for `DistTag`. Does not include `Project` -- that is
 * base config, supplied to the handler via the `PROJECT` env var instead.
 */
export function buildTrackResolverProperties(
  input: TrackResolverPropertiesInput,
): Record<string, string> {
  return {
    Package: input.package,
    Track: deriveTrack(input.version, input.granularity),
    DistTag: input.distTag ?? DEFAULT_DIST_TAG,
    Region: input.region,
  };
}
