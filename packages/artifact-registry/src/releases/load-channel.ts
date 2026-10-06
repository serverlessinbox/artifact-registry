import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { ArtifactType } from '../artifacts/artifact';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { buildArtifactBucketName } from '../registry';
import type { RegistryLocation } from '../registry';

/** Which channel of which packages {@link loadChannelVersions} lists, and where the packages live. */
export interface ChannelVersionsOptions {
  /** Artifact type — determines the S3 key prefix ('packages' or 'templates'). */
  artifactType: ArtifactType;
  /** Channel name, e.g. 'dev'. */
  channel: string;
  /** The registry location that names each package's bucket and the key prefix. */
  location: RegistryLocation;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

/**
 * Loads the S3 version map for all objects under {project}/{typePrefix}/{packageName}/channels/{channel}/
 * (see `buildArtifactKey`'s 'channel-prefix' spec; `typePrefix` follows `options.artifactType`).
 * Returns a flat map of s3Key → versionId for all latest-version objects.
 *
 * Uses ListObjectVersionsCommand with pagination to gather VersionIds needed for CloudFormation.
 * `client` must reach the bucket of every region in `options.packages`: construct it with
 * `followRegionRedirects: true`.
 */
export async function loadChannelVersions(client: S3Client, options: ChannelVersionsOptions): Promise<Record<string, string>> {
  const entries = Object.entries(options.packages);

  const results = await Promise.all(
    entries.map(async ([packageName, region]) => {
      const bucket = buildArtifactBucketName(options.location, region);
      const prefix = buildArtifactKey(options.artifactType, packageName, {
        type: 'channel-prefix',
        channel: options.channel,
        project: options.location.project,
      });
      const versionMap: Record<string, string> = {};

      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;

      // Paginate through all versions, collecting latest entries
      while (true) {
        const response = await client.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: prefix,
            KeyMarker: keyMarker,
            VersionIdMarker: versionIdMarker,
          }),
        );

        if (response.Versions) {
          for (const entry of response.Versions) {
            if (entry.IsLatest && entry.Key && entry.VersionId) {
              versionMap[entry.Key] = entry.VersionId;
            }
          }
        }

        // Check if there are more results to fetch
        if (!response.IsTruncated) {
          break;
        }

        keyMarker = response.NextKeyMarker;
        versionIdMarker = response.NextVersionIdMarker;
      }

      return versionMap;
    }),
  );

  // Merge all per-package maps into one flat map
  const merged: Record<string, string> = {};
  for (const versionMap of results) {
    Object.assign(merged, versionMap);
  }

  return merged;
}
