import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import * as t from 'typanion';

/** An artifact published in a release, as listed in the pointer's `objects[]`: its S3 object name (e.g. 'lambdas/admin-api.zip'). */
export const isReleasePointerObject = t.isObject({
  name: t.isString(),
});

export type ReleasePointerObject = t.InferType<typeof isReleasePointerObject>;

/**
 * The track-scoped, distTag-named pointer file, e.g.
 * `serverlessinbox/packages/{name}/releases/v1/stable.json`: the resolved version, the ISO 8601
 * timestamp it was published at, and the objects published in the release (at least one).
 */
export const isReleasePointer = t.isObject({
  version: t.isString(),
  publishedAt: t.isString(),
  objects: t.cascade(t.isArray(isReleasePointerObject), [t.hasMinLength(1)]),
});

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
      throw new Error(`${source}: object not found`);
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
