import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildArtifactKey } from './artifact-key';
import type { ArtifactType } from './types';
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

  async writeVersionPointers(bucket: string, artifactType: ArtifactType, name: string, version: SemVer): Promise<void> {
    const pointer = { version: version.version, publishedAt: new Date().toISOString() };
    if (version.prerelease.length > 0) {
      const prereleaseTag = String(version.prerelease[0]);
      await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-prerelease-pointer', prereleaseTag }), pointer);
      return;
    }
    const { major, minor } = version;
    await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-pointer' }), pointer);
    await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}` }), pointer);
    await this.uploadJson(bucket, buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}.${minor}` }), pointer);
  }
}
