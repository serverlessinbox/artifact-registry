import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import type { ArtifactType } from '../artifacts/artifact';
import { buildArtifactKey } from '../artifacts/artifact-key';

export interface ChannelVersionsOptions {
  /** Artifact type — determines the S3 key prefix ('packages' or 'templates'). */
  artifactType: ArtifactType;
  /** Channel name, e.g. 'dev'. */
  channel: string;
  /** Base bucket name without region suffix, e.g. 'mailbox-artifacts'. */
  bucketBase: string;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

/**
 * Loads the S3 version map for all objects under {project}/packages/{packageName}/channels/{channel}/
 * (see `buildArtifactKey`'s 'channel-prefix' spec).
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
      const bucket = `${options.bucketBase}-${region}`;
      const prefix = buildArtifactKey(options.artifactType, packageName, { type: 'channel-prefix', channel: options.channel });
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
