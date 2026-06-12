import { buildArtifactKey } from './artifact-key';
import type { ArtifactType } from './types';

export interface ReleaseTarget { readonly kind: 'release'; readonly version: string; }
export interface ChannelTarget  { readonly kind: 'channel'; readonly channel: string; }
export interface TrackTarget    { readonly kind: 'track';   readonly track: string;   }
export type ArtifactTarget = ReleaseTarget | ChannelTarget | TrackTarget;

/**
 * S3 prefix for a versioned release artifact (CDK production schema):
 *   packages/{packageName}/v{version}  or  templates/{packageName}/v{version}
 *
 * Note: buildArtifactKey's release spec uses "releases/v{version}" — a different schema.
 * Do NOT delegate to that. This function uses the CDK production schema directly.
 */
export function buildReleasePrefix(
  artifactType: ArtifactType,
  packageName: string,
  version: string,
): string {
  const typePrefix = artifactType === 'package' ? 'packages' : 'templates';
  return `${typePrefix}/${packageName}/v${version}`;
}

/**
 * S3 prefix for a mutable channel artifact:
 *   packages/{packageName}/channels/{channel}  or  templates/{packageName}/channels/{channel}
 */
export function buildChannelPrefix(
  artifactType: ArtifactType,
  packageName: string,
  channel: string,
): string {
  const key = buildArtifactKey(artifactType, packageName, {
    type: 'channel-prefix',
    channel,
  });
  return key.replace(/\/$/, '');
}

/** S3 bucket name: {bucketBase}-{region} */
export function buildArtifactBucketName(bucketBase: string, region: string): string {
  return `${bucketBase}-${region}`;
}
