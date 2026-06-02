import * as fs from 'fs/promises';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export class S3Uploader {
  private readonly client: S3Client;

  constructor() {
    this.client = new S3Client({});
  }

  async upload(bucket: string, key: string, filePath: string): Promise<void> {
    const body = await fs.readFile(filePath);
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
    }));
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
}
