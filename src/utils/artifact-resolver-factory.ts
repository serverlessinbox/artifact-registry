import type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
import { buildReleasePrefix, buildChannelPrefix, buildArtifactBucketName } from './artifact-target';
import type { ArtifactType } from './types';

/**
 * Pre-computed artifact resolution data for a single package.
 * Contains the resolved bucket name and S3 key prefix for that artifact.
 */
export interface ResolvedArtifactData {
  readonly bucket: string;
  readonly prefix: string;
  readonly versionId?: string;
}

/**
 * Factory options for resolving artifacts.
 */
export interface ArtifactResolverFactoryOptions {
  /** The parsed artifact-versions data (packages + optional bucketBase). */
  readonly versions: ParsedArtifactVersions;
  /** Optional override for bucketBase (e.g. from CDK context). Takes precedence over versions.bucketBase. */
  readonly bucketBaseOverride?: string;
  /** The deployment region (e.g. 'eu-west-1'). Used for 'regional' zone artifacts. */
  readonly deploymentRegion: string;
  /** The artifact type (default: 'package'). */
  readonly artifactType?: ArtifactType;
}

/**
 * Resolves a single artifact entry to bucket and prefix.
 * Called internally by the factory for each package.
 */
function resolveArtifactData(
  packageName: string,
  entry: ArtifactVersionsEntry,
  bucketBase: string,
  deploymentRegion: string,
  artifactType: ArtifactType,
): ResolvedArtifactData {
  // Determine the region based on zone
  const region = entry.zone === 'edge' ? 'us-east-1' : deploymentRegion;
  const bucket = buildArtifactBucketName(bucketBase, region);
  const prefix = buildReleasePrefix(artifactType, packageName, entry.version);

  return {
    bucket,
    prefix,
  };
}

/**
 * Factory function: builds a pre-computed map of resolved artifact data.
 *
 * Accepts parsed artifact-versions data (with bucketBase and per-package zone metadata),
 * an optional bucketBase override (for CDK context), and a deployment region.
 * Returns a frozen map from package name to resolved bucket and key prefix.
 *
 * This factory is pure and synchronous — no AWS SDK calls, no CDK types, no async.
 * The returned object is frozen and can be passed directly to CDK thin wrapper.
 */
export function createArtifactResolver(
  options: ArtifactResolverFactoryOptions,
): Record<string, ResolvedArtifactData> {
  const bucketBase = options.bucketBaseOverride ?? options.versions.bucketBase;
  if (!bucketBase) {
    throw new Error(
      `artifact-resolver-factory: bucketBase is required (either in versions file, as override, or both). ` +
      `Provide bucketBaseOverride or ensure versions.bucketBase is set.`,
    );
  }

  const artifactType = options.artifactType ?? 'package';
  const result: Record<string, ResolvedArtifactData> = {};

  for (const [packageName, entry] of Object.entries(options.versions.packages)) {
    result[packageName] = resolveArtifactData(
      packageName,
      entry,
      bucketBase,
      options.deploymentRegion,
      artifactType,
    );
  }

  // Return a frozen object to prevent accidental mutation
  return Object.freeze(result);
}

/**
 * Helper function: derives a region map from parsed artifact versions.
 * Maps each package name to the region where its artifact resolves.
 * This is used by pre-synth callers like loadChannelVersions.
 *
 * Returns: packageName → region string (either deployment region or us-east-1 for edge).
 */
export function createPackageRegionMap(
  versions: ParsedArtifactVersions,
  deploymentRegion: string,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [packageName, entry] of Object.entries(versions.packages)) {
    const region = entry.zone === 'edge' ? 'us-east-1' : deploymentRegion;
    result[packageName] = region;
  }

  return Object.freeze(result);
}
