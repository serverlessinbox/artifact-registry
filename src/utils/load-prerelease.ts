import { S3Client, ListObjectVersionsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { parse as parseSemver } from 'semver';
import type { ArtifactType } from './types';
import { buildArtifactKey } from './artifact-key';
import type { TrackVersionsResult } from './load-track';

export interface PrereleaseVersionsOptions {
  /** Prerelease tag (distTag), e.g. 'beta', 'calendar', 'rc'. */
  prereleaseTag: string;
  /**
   * Track name, e.g. 'v1', 'v1.2'. Required -- prerelease pointers are track-scoped just like
   * stable ones (`{project}/packages/{name}/releases/{track}/{distTag}.json`); there is no
   * global/untracked prerelease pointer.
   */
  track: string;
  bucketBase: string;
  artifactType: ArtifactType;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

/**
 * Loads the S3 version map for all objects under a track-scoped prerelease distTag.
 * Reads the prerelease pointer to determine the pinned version, then lists all
 * objects under {project}/packages/{name}/releases/v{version}/ — the same buildArtifactKey
 * type:'release' schema that buildReleasePrefix (artifact-target.ts) now also routes through,
 * so the CDK-side resolver's prefix agrees with this listing.
 */
export async function loadPrereleaseVersions(options: PrereleaseVersionsOptions): Promise<TrackVersionsResult> {
  const entries = Object.entries(options.packages);

  const results = await Promise.all(
    entries.map(async ([packageName, region]) => {
      const bucket = `${options.bucketBase}-${region}`;
      const client = new S3Client({ region });

      // 1. Build the track-scoped, distTag-named prerelease pointer key
      const pointerKey = buildArtifactKey(options.artifactType, packageName, {
        type: 'release-pointer',
        track: options.track,
        distTag: options.prereleaseTag,
      });

      // 2. Fetch and parse the pointer file
      const pointerRes = await client.send(new GetObjectCommand({ Bucket: bucket, Key: pointerKey }));
      if (!pointerRes.Body) {
        throw new Error(`Pointer file body is undefined for key: ${pointerKey} in bucket: ${bucket}`);
      }
      const pointerBody = await pointerRes.Body.transformToString('utf-8');
      const pointer = JSON.parse(pointerBody) as { version: string; publishedAt: string };
      const parsed = parseSemver(pointer.version);
      if (!parsed) {
        throw new Error(`Invalid semver in pointer file ${pointerKey}: "${pointer.version}"`);
      }
      const resolvedVersion = parsed.version;

      // 3. Build listing prefix using buildArtifactKey 'release' schema: {project}/packages/{name}/releases/v{version}/
      //    This is the schema written by uploader.ts; buildReleasePrefix (artifact-target.ts, used by the
      //    CDK-side resolver) now routes through the same buildArtifactKey spec, so both sides agree.
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
