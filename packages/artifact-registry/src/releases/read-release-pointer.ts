import type { S3Client } from '@aws-sdk/client-s3';
import { buildReleasePointerKey } from '../artifacts/artifact-key';
import { buildArtifactBucketName } from '../registry';
import type { RegistryLocation } from '../registry';
import { loadReleasePointer } from './release-pointer';
import type { ReleasePointer } from './release-pointer';

/**
 * Read the release pointer of a `package` artifact from S3 and return its structured content.
 *
 * @param client — the S3 client to read through; it must be configured for `region`
 * @param location — the registry location that names the bucket of `region` and the key prefix
 * @param packageName — the package name, passed to buildReleasePointerKey
 * @param distTag — the dist-tag / release line (e.g., 'stable', 'beta')
 * @param region — the AWS region of the bucket
 * @param track — track segment for the pointer key, e.g. 'v1' or 'v1.2' (scoped pointer); when omitted, reads the global pointer
 * @returns the validated ReleasePointer
 * @throws when the pointer is missing, empty, not valid JSON or malformed (see `loadReleasePointer`), or on other S3 errors
 */
export async function readReleasePointer(
  client: S3Client,
  location: RegistryLocation,
  packageName: string,
  distTag: string,
  region: string,
  track?: string,
): Promise<ReleasePointer> {
  const bucket = buildArtifactBucketName(location, region);
  const key = buildReleasePointerKey('package', packageName, { distTag, project: location.project, track });

  return loadReleasePointer(client, bucket, key);
}
