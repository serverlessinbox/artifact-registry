import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildArtifactKey } from './artifact-key';
import { buildArtifactBucketName } from './artifact-target';
import { loadChannelVersions } from './load-channel';
import type { ArtifactType } from './types';
import type { ArtifactTarget } from './artifact-target';
import type { ChannelVersionsOptions } from './load-channel';

export interface ResolvedArtifact {
  readonly key: string;
  readonly bucket: string;
  readonly versionId?: string;
}

export interface IArtifactRegistry {
  resolve(
    artifactType: ArtifactType,
    name: string,
    target: ArtifactTarget,
    objectPath: string,
    region: string,
  ): Promise<ResolvedArtifact>;

  listChannel(options: ChannelVersionsOptions): Promise<Record<string, string>>;
}

export class S3ArtifactRegistry implements IArtifactRegistry {
  private readonly clients = new Map<string, S3Client>();

  constructor(private readonly bucketBase: string) {}

  private client(region: string): S3Client {
    if (!this.clients.has(region)) {
      this.clients.set(region, new S3Client({ region }));
    }
    return this.clients.get(region)!;
  }

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
        version: { version: target.version } as any,
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

    // TrackTarget: read release-pointer from S3
    const pointerKey = buildArtifactKey(artifactType, name, {
      type: 'release-pointer',
      track: target.track,
    });
    const pointerRes = await this.client(region).send(
      new GetObjectCommand({ Bucket: bucket, Key: pointerKey }),
    );
    const body = await pointerRes.Body!.transformToString('utf-8');
    const { version } = JSON.parse(body) as { version: string };
    const key = buildArtifactKey(artifactType, name, {
      type: 'release',
      version: { version } as any,
      objectName: objectPath,
    });
    return { key, bucket };
  }

  async listChannel(options: ChannelVersionsOptions): Promise<Record<string, string>> {
    return loadChannelVersions(options);
  }
}
