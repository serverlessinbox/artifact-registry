import { buildArtifactKey } from './artifact-key';
import type { ArtifactType } from './types';

export interface ReleaseTarget { readonly kind: 'release'; readonly version: string; }
export interface ChannelTarget  { readonly kind: 'channel'; readonly channel: string; }
export interface TrackTarget    { readonly kind: 'track';   readonly track: string;   }
export type ArtifactTarget = ReleaseTarget | ChannelTarget | TrackTarget;

/**
 * S3 prefix for a versioned release artifact — routes through `buildArtifactKey`'s
 * 'release' spec with an empty objectName, so it stays in lockstep with the schema every writer
 * uses:
 *   {project}/packages/{packageName}/releases/v{version}  or  {project}/templates/{packageName}/releases/v{version}
 */
export function buildReleasePrefix(
  artifactType: ArtifactType,
  packageName: string,
  version: string,
  project?: string,
): string {
  const key = buildArtifactKey(artifactType, packageName, {
    type: 'release',
    version: { version } as any,
    objectName: '',
    project,
  });
  return key.replace(/\/$/, '');
}

/**
 * S3 prefix for a mutable channel artifact:
 *   {project}/packages/{packageName}/channels/{channel}  or  {project}/templates/{packageName}/channels/{channel}
 */
export function buildChannelPrefix(
  artifactType: ArtifactType,
  packageName: string,
  channel: string,
  project?: string,
): string {
  const key = buildArtifactKey(artifactType, packageName, {
    type: 'channel-prefix',
    channel,
    project,
  });
  return key.replace(/\/$/, '');
}

/** S3 bucket name: {bucketBase}-{region} */
export function buildArtifactBucketName(bucketBase: string, region: string): string {
  return `${bucketBase}-${region}`;
}

/** HTTPS URL for an S3 object, optionally pinned to a specific version. */
export function buildArtifactUrl(bucket: string, region: string, key: string, versionId?: string): string {
  const base = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  return versionId !== undefined && versionId !== '' ? `${base}?versionId=${versionId}` : base;
}

/** S3 ARN for an object: arn:aws:s3:::{bucket}/{key} */
export function buildArtifactArn(bucket: string, key: string): string {
  return `arn:aws:s3:::${bucket}/${key}`;
}
