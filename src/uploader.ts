import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import semver from 'semver';

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

  async uploadChannel(bucket: string, basePath: string, channel: string, objectName: string, filePath: string): Promise<void> {
    const key = `${basePath}/channels/${channel}/${objectName}`;
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

  async writeVersionPointers(bucket: string, basePath: string, version: string): Promise<void> {
    const parsed = semver.parse(version);
    if (!parsed) return;
    const { major, minor } = parsed;
    const pointer = { version, publishedAt: new Date().toISOString() };
    for (const track of [
      'latest-stable',
      `v${major}/latest-stable`,
      `v${major}.${minor}/latest-stable`,
    ]) {
      await this.uploadJson(bucket, `${basePath}/${track}.json`, pointer);
    }
  }
}
