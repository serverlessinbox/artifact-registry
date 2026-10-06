import type { S3Client } from '@aws-sdk/client-s3';
import { AccessDenied, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import type { RegistryLocation, RegistryRecord } from '../registry';
import { buildArtifactBucketName, parseRegistryRecord, registryRecordKey } from '../registry';

/**
 * Loads and validates the registry record from S3.
 *
 * @param client — the S3 client to read through
 * @param location — the registry location that names the bucket and key prefix
 * @param region — the AWS region of the bucket
 * @returns the validated RegistryRecord
 * @throws when the record cannot be loaded or parsed; error messages name the bucket and key
 */
export async function loadRegistryRecord(
  client: S3Client,
  location: RegistryLocation,
  region: string,
): Promise<RegistryRecord> {
  const bucket = buildArtifactBucketName(location, region);
  const key = registryRecordKey(location.project);
  const source = `s3://${bucket}/${key}`;

  let body: string;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    body = await res.Body.transformToString('utf-8');
  } catch (err: unknown) {
    if (err instanceof NoSuchKey || (err instanceof Error && err.name === 'NoSuchKey')) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    if (err instanceof AccessDenied || (err instanceof Error && err.name === 'AccessDenied')) {
      throw new Error(`registry record ${source}: missing or not readable`);
    }
    throw err;
  }

  if (body === '') {
    throw new Error(`registry record ${source}: missing or not readable`);
  }

  return parseRegistryRecord(body, source);
}
