/**
 * Runtime utility for the scheduled updater to read track-scoped release pointers from S3.
 *
 * Used by the scheduled auto-updater Lambda (stack-self-update, Phase B) to discover
 * the latest version within a granularity-bounded track (e.g., `v1` or `v1.2`).
 * Returns `undefined` (not an error) if the pointer key is not found — the updater
 * skips packages with no pointer (nothing new to update to).
 */

import { S3Client, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { buildReleasePointerKey, DEFAULT_PROJECT } from './artifact-key';
import type { LatestStablePointer } from './types';

export interface ReadReleasePointerOptions {
  /** S3 bucket base name (defaults to 'mailbox-artifacts', suffixed with `-{region}`). */
  bucketBase?: string;
  /** Project prefix for S3 keys (defaults to 'serverlessinbox'). */
  project?: string;
  /** Track segment for the pointer key, e.g. 'v1' or 'v1.2' (scoped pointer). If omitted, reads the global pointer. */
  track?: string;
}

/**
 * Read a release pointer from S3 and return its structured content.
 *
 * @param packageName — the package name (e.g., 'mailbox-go', 'mailbox-cdk'), passed to buildReleasePointerKey
 * @param distTag — the dist-tag / release line (e.g., 'stable', 'beta')
 * @param region — the AWS region for the S3 client and bucket suffix
 * @param options — optional bucket base, project prefix, and track segment
 * @returns the parsed LatestStablePointer, or undefined if the key does not exist
 * @throws on S3 errors other than NoSuchKey, or JSON parse errors
 */
export async function readReleasePointer(
  packageName: string,
  distTag: string,
  region: string,
  options?: ReadReleasePointerOptions,
): Promise<LatestStablePointer | undefined> {
  const bucketBase = options?.bucketBase ?? 'mailbox-artifacts';
  const project = options?.project ?? DEFAULT_PROJECT;
  const track = options?.track;

  const bucket = `${bucketBase}-${region}`;
  const key = buildReleasePointerKey('package', packageName, { distTag, project, track });

  const s3 = new S3Client({ region });
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) {
      return undefined;
    }

    const text = await res.Body.transformToString('utf-8');
    const pointer = JSON.parse(text) as LatestStablePointer;
    return pointer;
  } catch (err: any) {
    // NoSuchKey is expected when a pointer doesn't exist; return undefined.
    if (err instanceof NoSuchKey || err.name === 'NoSuchKey') {
      return undefined;
    }
    // All other errors (network, parse, etc.) are thrown — the updater logs them.
    throw err;
  }
}
