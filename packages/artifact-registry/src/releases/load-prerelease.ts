import { ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { parse as parseSemver } from 'semver';
import type { ArtifactType } from '../artifacts/artifact';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { buildArtifactBucketName } from '../artifacts/artifact-target';
import type { RegistryLocation } from '../artifacts/registry-location';
import { loadReleasePointer } from './release-pointer';
import type { TrackVersionsResult } from './load-track';

/** Which prerelease pointer to read for each package, and where the packages live. */
export interface PrereleaseVersionsOptions {
  /** Prerelease tag (distTag), e.g. 'beta', 'calendar', 'rc'. */
  prereleaseTag: string;
  /**
   * Track name, e.g. 'v1', 'v1.2'. When omitted, the GLOBAL untracked prerelease
   * pointer is used (`{project}/{typePrefix}/{name}/releases/{distTag}.json`); when present,
   * the track-scoped pointer (`{project}/{typePrefix}/{name}/releases/{track}/{distTag}.json`).
   */
  track?: string;
  /** The registry location that names each package's bucket and the key prefix. */
  location: RegistryLocation;
  artifactType: ArtifactType;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

/**
 * Loads the S3 version map for all objects of the version a prerelease pointer names.
 * Reads each package's prerelease pointer to determine the pinned version, then lists all
 * objects under the release prefix of that version (the `buildArtifactKey` 'release' layout).
 * Throws when a pointer is missing or malformed, or names a version that is not valid semver.
 * `client` must reach the bucket of every region in `options.packages`: construct it with
 * `followRegionRedirects: true`.
 */
export async function loadPrereleaseVersions(client: S3Client, options: PrereleaseVersionsOptions): Promise<TrackVersionsResult> {
  const entries = Object.entries(options.packages);

  const results = await Promise.all(
    entries.map(async ([packageName, region]) => {
      const bucket = buildArtifactBucketName(options.location, region);

      // 1. Build the distTag-named prerelease pointer key
      const pointerKey = buildArtifactKey(options.artifactType, packageName, {
        type: 'release-pointer',
        track: options.track,
        distTag: options.prereleaseTag,
        project: options.location.project,
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
        project: options.location.project,
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
