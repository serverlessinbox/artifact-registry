import type { S3Client } from '@aws-sdk/client-s3';
import { buildArtifactKey } from './artifact-key';
import { buildArtifactBucketName } from './artifact-target';
import { loadChannelVersions } from './load-channel';
import { loadReleasePointer } from './release-pointer';
import type { ArtifactType } from './artifact';
import type { ArtifactTarget } from './artifact-target';
import type { ChannelVersionsOptions } from './load-channel';

/**
 * The S3 location of one artifact object: the bucket, the object key and, when the object is
 * pinned to a specific S3 object version, that version ID.
 */
export interface ResolvedArtifact {
  readonly key: string;
  readonly bucket: string;
  readonly versionId?: string;
}

/**
 * Locates artifact objects in S3 for a release, channel or track target. Resolution may read from
 * S3 (a track target reads its release pointer); it does not download the artifact itself.
 */
export interface IArtifactRegistry {
  /**
   * Resolves `objectPath` of the named artifact for `target` in the artifact bucket of `region`.
   * A track target is resolved by reading that track's release pointer, so it rejects when the
   * pointer is missing or malformed.
   */
  resolve(
    artifactType: ArtifactType,
    name: string,
    target: ArtifactTarget,
    objectPath: string,
    region: string,
  ): Promise<ResolvedArtifact>;

  /** Lists the channel described by `options`; delegates to `loadChannelVersions`. */
  listChannel(options: ChannelVersionsOptions): Promise<Record<string, string>>;
}

/**
 * {@link IArtifactRegistry} backed by S3. `bucketBase` is the bucket name without its region
 * suffix; `client` must reach the bucket of every region that is resolved or listed: construct it
 * with `followRegionRedirects: true`.
 */
export class S3ArtifactRegistry implements IArtifactRegistry {
  constructor(
    private readonly bucketBase: string,
    private readonly client: S3Client,
  ) {}

  async resolve(
    artifactType: ArtifactType,
    name: string,
    target: ArtifactTarget,
    objectPath: string,
    region: string,
  ): Promise<ResolvedArtifact> {
    const bucket = buildArtifactBucketName(this.bucketBase, region);

    if (target.kind === 'release') {
      const key = buildArtifactKey(artifactType, name, {
        type: 'release',
        version: { version: target.version },
        objectName: objectPath,
      });
      return { key, bucket };
    }

    if (target.kind === 'channel') {
      const key = buildArtifactKey(artifactType, name, {
        type: 'channel',
        channel: target.channel,
        objectName: objectPath,
      });
      return { key, bucket };
    }

    // The remaining target is a track: the release pointer names the version.
    const pointerKey = buildArtifactKey(artifactType, name, {
      type: 'release-pointer',
      track: target.track,
    });
    const pointer = await loadReleasePointer(this.client, bucket, pointerKey);
    const key = buildArtifactKey(artifactType, name, {
      type: 'release',
      version: { version: pointer.version },
      objectName: objectPath,
    });
    return { key, bucket };
  }

  async listChannel(options: ChannelVersionsOptions): Promise<Record<string, string>> {
    return loadChannelVersions(this.client, options);
  }
}
