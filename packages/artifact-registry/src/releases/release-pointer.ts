import type { S3Client } from '@aws-sdk/client-s3';
import { AccessDenied, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import * as t from 'typanion';

export const isReleasePointerObject = t.isObject({
  name: t.isString(),
});

/** An artifact published in a release: its S3 object name (e.g. 'lambdas/admin-api.zip'). Listed in the release pointer's `objects[]`. */
export type ReleasePointerObject = t.InferType<typeof isReleasePointerObject>;

export const isReleasePointer = t.isObject({
  version: t.isString(),
  publishedAt: t.isString(),
  objects: t.cascade(t.isArray(isReleasePointerObject), [t.hasMinLength(1)]),
});

/** A release pointer file (`{distTag}.json`, global or per track): the version it names, when it was published (ISO 8601), and the objects of that release (at least one). */
export type ReleasePointer = t.InferType<typeof isReleasePointer>;

/**
 * Loads and validates the release pointer at `s3://{bucket}/{key}`. Always throws when the
 * pointer cannot be returned; every message reads `release pointer s3://{bucket}/{key}: {problem}`
 * where the problem is `object not found`, `empty body`, `not valid JSON` or the field errors.
 * Other S3 errors propagate unchanged.
 */
export async function loadReleasePointer(client: S3Client, bucket: string, key: string): Promise<ReleasePointer> {
  const source = `release pointer s3://${bucket}/${key}`;

  let body: string;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      throw new Error(`${source}: empty body`);
    }
    body = await res.Body.transformToString('utf-8');
  } catch (err: unknown) {
    if (err instanceof NoSuchKey || (err instanceof Error && err.name === 'NoSuchKey')) {
      throw new Error(`${source}: missing or not readable`);
    }
    if (err instanceof AccessDenied || (err instanceof Error && err.name === 'AccessDenied')) {
      throw new Error(`${source}: missing or not readable`);
    }
    throw err;
  }
  if (body === '') {
    throw new Error(`${source}: empty body`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${source}: not valid JSON`);
  }

  const errors: string[] = [];
  if (!isReleasePointer(parsed, { errors })) {
    throw new Error(`${source}: ${errors.join('; ')}`);
  }
  return parsed;
}
