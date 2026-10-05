import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { buildArtifactKey } from '../artifacts/artifact-key';
import type { ReleasePointer } from './release-pointer';
import type { ArtifactPackage } from '../artifacts/artifact';
import type { PackageRelease, ReleaseTrackCopy } from './release';
import type { SemVer } from 'semver';

/**
 * Writes artifact files, JSON documents and release pointers to S3 under the key layouts of
 * `buildArtifactKey`. It uploads what it is given and never lists or deletes objects.
 */
export class S3Uploader {
  constructor(private readonly client: S3Client) {}

  async upload(bucket: string, key: string, filePath: string): Promise<void> {
    const body = await fs.readFile(filePath);
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    }));
  }

  async uploadChannel(pkg: ArtifactPackage, channel: string, objectName: string, filePath: string): Promise<void> {
    const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'channel', channel, objectName });
    await this.upload(pkg.bucketName, key, filePath);
  }

  async uploadJson(bucket: string, key: string, data: unknown): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }));
  }

  async uploadReleaseTrack(copy: ReleaseTrackCopy, track: string): Promise<void> {
    const pkg = copy.package;
    for (const entry of copy.entries) {
      const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release-track', track, objectName: entry.objectName });
      await this.upload(pkg.bucketName, key, entry.filePath);
    }
  }

  /**
   * Writes the track-scoped, distTag-named pointer files for a release: one global (untracked),
   * one at v{major} granularity, one at v{major}.{minor}. `distTag` is 'stable' for a normal
   * release, or the GitVersion prerelease label (e.g. 'beta', 'calendar') for a prerelease.
   *
   * `release.objects` declares every artifact published in this release (at least one), so a reader
   * of the pointer learns the object names from it.
   */
  async writeVersionPointers(release: PackageRelease, version: SemVer): Promise<void> {
    const pkg = release.package;
    const pointer: ReleasePointer = { version: version.version, publishedAt: new Date().toISOString(), objects: release.objects };
    const distTag = version.prerelease.length > 0 ? String(version.prerelease[0]) : undefined;
    const { major, minor } = version;
    const { bucketName, artifactType, name } = pkg;
    await this.uploadJson(bucketName, buildArtifactKey(artifactType, name, { type: 'release-pointer', distTag }), pointer);
    await this.uploadJson(bucketName, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}`, distTag }), pointer);
    await this.uploadJson(bucketName, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}.${minor}`, distTag }), pointer);
  }
}
