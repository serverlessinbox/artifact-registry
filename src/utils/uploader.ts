import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildArtifactKey } from './artifact-key';
import type { ArtifactType, LatestStableObject, LatestStablePointer } from './types';
import type { SemVer } from 'semver';

export class S3Uploader {
  private readonly client: S3Client;

  constructor(config?: { region?: string }) {
    this.client = new S3Client({ region: config?.region });
  }

  async upload(bucket: string, key: string, filePath: string): Promise<void> {
    const body = await fs.readFile(filePath);
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    }));
  }

  async uploadChannel(bucket: string, artifactType: ArtifactType, name: string, channel: string, objectName: string, filePath: string): Promise<void> {
    const key = buildArtifactKey(artifactType, name, { type: 'channel', channel, objectName });
    await this.upload(bucket, key, filePath);
  }

  async uploadJson(bucket: string, key: string, data: unknown): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }));
  }

  async readJson(bucket: string, key: string): Promise<unknown> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));
    const body = await response.Body?.transformToString();
    if (body === undefined) {
      throw new Error(`S3 object s3://${bucket}/${key} has no body`);
    }
    return JSON.parse(body);
  }

  async uploadReleaseTrack(bucket: string, artifactType: ArtifactType, name: string, track: string, entries: Array<{ objectName: string; filePath: string }>): Promise<void> {
    for (const entry of entries) {
      const key = buildArtifactKey(artifactType, name, { type: 'release-track', track, objectName: entry.objectName });
      await this.upload(bucket, key, entry.filePath);
    }
  }

  /**
   * Writes the track-scoped, distTag-named pointer files for a release: one at v{major}
   * granularity, one at v{major}.{minor}. `distTag` is 'stable' for a normal release, or
   * the GitVersion prerelease label (e.g. 'beta', 'calendar') for a prerelease -- both are
   * track-scoped now, uniformly, so there is no separate global/untracked prerelease branch.
   *
   * `objects` declares every artifact published in this release, self-describing for the
   * TrackResolver custom resource (`track-resolver-handler.ts`) to route without hardcoding names --
   * omitting it (or passing an empty array) writes a pointer with no `objects[]`, from which the
   * resolver can resolve a version but zero per-object S3 keys.
   */
  async writeVersionPointers(bucket: string, artifactType: ArtifactType, name: string, version: SemVer, objects: LatestStableObject[] = []): Promise<void> {
    const pointer: LatestStablePointer = { version: version.version, publishedAt: new Date().toISOString(), objects };
    const distTag = version.prerelease.length > 0 ? String(version.prerelease[0]) : undefined;
    const { major, minor } = version;
    await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}`, distTag }), pointer);
    await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}.${minor}`, distTag }), pointer);
  }
}
