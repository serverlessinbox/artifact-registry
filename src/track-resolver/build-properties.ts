/**
 * CDK-wiring helper for the TrackResolver custom resource (plan-a, stack-self-update).
 *
 * Pure data -- zero `aws-cdk-lib`/construct imports. `mailbox-cdk`'s construct calls this to build
 * the exact `ResourceProperties` object a `CfnCustomResource` should pass to the handler in
 * `track-resolver-handler.ts`; the handler and this function are the only two places that need to
 * agree on the property shape (`{ Project, Package, Track, DistTag }`).
 */

import { DEFAULT_PROJECT, DEFAULT_DIST_TAG } from '../utils/artifact-key';

export interface TrackResolverPropertiesInput {
  /** Defaults to `serverlessinbox` (the default project prefix). */
  project?: string;
  /** Single package name to resolve, e.g. `mailbox-go`. Required -- one resolver per package. */
  package: string;
  /** Track string, e.g. `v1` or `v1.2`. Required. */
  track: string;
  /** Defaults to `stable`. */
  distTag?: string;
}

/**
 * Build the `CfnCustomResource` ResourceProperties object the TrackResolver handler expects,
 * applying the same `serverlessinbox`/`stable` defaults the handler itself falls back to.
 */
export function buildTrackResolverProperties(
  input: TrackResolverPropertiesInput,
): Record<string, string> {
  return {
    Project: input.project ?? DEFAULT_PROJECT,
    Package: input.package,
    Track: input.track,
    DistTag: input.distTag ?? DEFAULT_DIST_TAG,
  };
}
