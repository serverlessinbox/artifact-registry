import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { parse as parseSemver } from 'semver';
import type { ArtifactType } from '../artifacts/artifact';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { loadReleasePointer } from './release-pointer';

export interface TrackVersionsOptions {
  /**
   * Track name, e.g. 'v1', 'v1.2'. When omitted, the GLOBAL untracked 'stable'
   * pointer is used (`{project}/{typePrefix}/{name}/releases/stable.json`); when present,
   * the track-scoped pointer (`{project}/{typePrefix}/{name}/releases/{track}/stable.json`).
   */
  track?: string;
  /** Bucket name without region suffix; each package's bucket is `{bucketBase}-{region}`. */
  bucketBase: string;
  artifactType: ArtifactType;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

export interface TrackVersionsResult {
  /** S3 key → versionId, for the latest version of every object found under the resolved versions' release prefixes. */
  versionMap: Record<string, string>;
  /** packageName → resolved semver string. */
  resolvedVersions: Record<string, string>;
}

/**
 * Loads the S3 version map for all objects of the version a 'stable' release pointer names.
 * Reads each package's pointer (track-scoped, or global when no track is given) to determine the
 * pinned version, then lists all objects under the release prefix of that version (the
 * `buildArtifactKey` 'release' layout).
 * Throws when a pointer is missing or malformed, or names a version that is not valid semver.
 * `client` must reach the bucket of every region in `options.packages`: construct it with
 * `followRegionRedirects: true`.
 */
export async function loadTrackVersions(client: S3Client, options: TrackVersionsOptions): Promise<TrackVersionsResult> {
  const entries = Object.entries(options.packages);

  const results = await Promise.all(
    entries.map(async ([packageName, region]) => {
      const bucket = `${options.bucketBase}-${region}`;

      // 1. Build pointer key
      const pointerKey = buildArtifactKey(options.artifactType, packageName, {
        type: 'release-pointer',
        track: options.track,
      });

      // 2. Fetch and parse the pointer file
      const pointer = await loadReleasePointer(client, bucket, pointerKey);
      const parsed = parseSemver(pointer.version);
      if (!parsed) {
        throw new Error(`Invalid semver in pointer file ${pointerKey}: "${pointer.version}"`);
      }
      const resolvedVersion = parsed.version;

      // 3. Build the listing prefix with the buildArtifactKey 'release' layout: {project}/{typePrefix}/{name}/releases/v{version}/
      const listingPrefix = buildArtifactKey(options.artifactType, packageName, {
        type: 'release',
        version: parsed,
        objectName: '',
      });

      // 4. Paginate ListObjectVersionsCommand to collect latest versionIds
      const versionMap: Record<string, string> = {};
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;

      while (true) {
        const response = await client.send(
          new ListObjectVersionsCommand({
            Bucket: bucket,
            Prefix: listingPrefix,
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

        if (!response.IsTruncated) {
          break;
        }

        keyMarker = response.NextKeyMarker;
        versionIdMarker = response.NextVersionIdMarker;
      }

      return { packageName, versionMap, resolvedVersion };
    }),
  );

  const mergedVersionMap: Record<string, string> = {};
  const resolvedVersions: Record<string, string> = {};

  for (const { packageName, versionMap, resolvedVersion } of results) {
    Object.assign(mergedVersionMap, versionMap);
    resolvedVersions[packageName] = resolvedVersion;
  }

  return { versionMap: mergedVersionMap, resolvedVersions };
}


