import type { S3Client } from '@aws-sdk/client-s3';
import { buildReleasePointerKey, DEFAULT_PROJECT } from '../artifacts/artifact-key';
import { loadReleasePointer } from './release-pointer';
import type { ReleasePointer } from './release-pointer';

/** Where `readReleasePointer` looks; every field falls back to the default named on it. */
export interface ReadReleasePointerOptions {
  /** S3 bucket base name (defaults to 'mailbox-artifacts', suffixed with `-{region}`). */
  bucketBase?: string;
  /** Project prefix for S3 keys (defaults to 'serverlessinbox'). */
  project?: string;
  /** Track segment for the pointer key, e.g. 'v1' or 'v1.2' (scoped pointer). If omitted, reads the global pointer. */
  track?: string;
}

/**
 * Read the release pointer of a `package` artifact from S3 and return its structured content.
 *
 * @param client — the S3 client to read through; it must be configured for `region`
 * @param packageName — the package name (e.g., 'mailbox-go', 'mailbox-cdk'), passed to buildReleasePointerKey
 * @param distTag — the dist-tag / release line (e.g., 'stable', 'beta')
 * @param region — the AWS region of the bucket, used as the bucket name suffix
 * @param options — optional bucket base, project prefix, and track segment
 * @returns the validated ReleasePointer
 * @throws when the pointer is missing, empty, not valid JSON or malformed (see `loadReleasePointer`), or on other S3 errors
 */
export async function readReleasePointer(
  client: S3Client,
  packageName: string,
  distTag: string,
  region: string,
  options?: ReadReleasePointerOptions,
): Promise<ReleasePointer> {
  const bucketBase = options?.bucketBase ?? 'mailbox-artifacts';
  const project = options?.project ?? DEFAULT_PROJECT;
  const track = options?.track;

  const bucket = `${bucketBase}-${region}`;
  const key = buildReleasePointerKey('package', packageName, { distTag, project, track });

  return loadReleasePointer(client, bucket, key);
}
