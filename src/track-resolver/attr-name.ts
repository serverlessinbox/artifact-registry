/**
 * Data-attribute name transforms for TrackResolver custom resource.
 *
 * These functions produce deterministic `Fn.getAtt()` attribute names. Single source, two consumers:
 * `track-resolver-handler.ts` imports this directly (esbuild bundles it into the minified handler
 * string, so there is no separate hand-copied version to keep in sync), and `mailbox-cdk`'s
 * `TrackAwareArtifactResolver` imports it to read the matching `GetAtt` attribute name.
 *
 * Collision note: distinct (packageName, objectPath) pairs could in principle sanitize to the same
 * attribute name (e.g. differing only in characters this replaces with `_`). Accepted low risk given
 * this repo's actual naming conventions (`lambdas/<name>.zip`, `ui/<name>.zip` -- no two real
 * artifacts collide under this transform today); not defended against.
 */

/**
 * Attribute name for a resolved S3 object key.
 * Format: `obj_${packageName}_${objectPath}` with non-alphanumeric characters replaced by `_`.
 * Example: `obj_mailbox_go_lambdas_admin_api_zip` for package `mailbox-go`, object `lambdas/admin-api.zip`.
 */
export function trackResolverObjectAttrName(packageName: string, objectPath: string): string {
  return `obj_${packageName}_${objectPath}`.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Attribute name for a resolved version string.
 * Format: `ver_${packageName}` with non-alphanumeric characters replaced by `_`.
 * Example: `ver_mailbox_go` for package `mailbox-go`.
 */
export function trackResolverVersionAttrName(packageName: string): string {
  return `ver_${packageName}`.replace(/[^A-Za-z0-9_]/g, '_');
}
