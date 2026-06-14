import type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
import { buildReleasePrefix, buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from './artifact-target';
import type { ArtifactType } from './types';
import type { ResolvedArtifact } from './artifact-registry';

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
 * Resolves a {@link ResolvedArtifact} for a specific object within a resolved
 * artifact. The S3 key is formed by joining `data.prefix` and `objectPath`
 * (any leading slashes on `objectPath` are stripped).
 */
export function resolveArtifact(data: ResolvedArtifactData, objectPath: string): ResolvedArtifact {
  const normalizedPath = objectPath.replace(/^\/+/, '');
  const key = `${data.prefix}/${normalizedPath}`;
  if (data.versionId !== undefined) {
    return { key, bucket: data.bucket, versionId: data.versionId };
  }
  return { key, bucket: data.bucket };
}

/**
 * Pure interface for artifact resolution — no CDK, no AWS SDK.
 */
export interface IArtifactResolver {
  resolve(packageName: string, objectPath: string): ResolvedArtifact;
  getUrl(packageName: string, objectPath: string): string;
  getArn(packageName: string, objectPath: string): string;
  /** Raw version string for the given package (e.g. "0.0.21" or "dev"). */
  getVersion(packageName: string): string;
  /** S3 version ID for the given package, or undefined if not pinned. */
  getVersionId(packageName: string): string | undefined;
  /** Bucket base (without region suffix), shared across all packages. */
  getBucketBase(): string;
}

/**
 * Pure TypeScript artifact resolver. No CDK, no AWS SDK.
 * Holds pre-computed resolution data for all packages in the versions file.
 */
export class ArtifactResolver implements IArtifactResolver {
  private readonly resolvedData: Record<string, ResolvedArtifactData>;
  private readonly _regionMap: Record<string, string>;
  private readonly _versionMap: Record<string, string>;
  private readonly _bucketBase: string;

  constructor(options: ArtifactResolverFactoryOptions) {
    const bucketBase = options.bucketBaseOverride ?? options.versions.bucketBase;
    if (!bucketBase) {
      throw new Error(
        'artifact-resolver-factory: bucketBase is required (either in versions file, as override, or both). ' +
        'Provide bucketBaseOverride or ensure versions.bucketBase is set.',
      );
    }
    const artifactType = options.artifactType ?? 'package';
    const resolved: Record<string, ResolvedArtifactData> = {};
    const regionMap: Record<string, string> = {};

    for (const [packageName, entry] of Object.entries(options.versions.packages)) {
      resolved[packageName] = resolveArtifactData(packageName, entry, bucketBase, options.deploymentRegion, artifactType);
      regionMap[packageName] = entry.zone === 'edge' ? 'us-east-1' : options.deploymentRegion;
    }

    this.resolvedData = Object.freeze(resolved);
    this._regionMap = Object.freeze(regionMap);
    this._versionMap = Object.freeze(
      Object.fromEntries(
        Object.entries(options.versions.packages).map(([name, entry]) => [name, entry.version])
      )
    );
    this._bucketBase = bucketBase;
  }

  resolve(packageName: string, objectPath: string): ResolvedArtifact {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    return resolveArtifact(data, objectPath);
  }

  getUrl(packageName: string, objectPath: string): string {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    const resolved = resolveArtifact(data, objectPath);
    const region = this._regionMap[packageName]!;
    return buildArtifactUrl(data.bucket, region, resolved.key, data.versionId);
  }

  getArn(packageName: string, objectPath: string): string {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    const key = resolveArtifact(data, objectPath).key;
    return buildArtifactArn(data.bucket, key);
  }

  getVersion(packageName: string): string {
    const v = this._versionMap[packageName];
    if (v === undefined) throw new Error(`No resolved data for package '${packageName}'`);
    return v;
  }

  getVersionId(packageName: string): string | undefined {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    return data.versionId;
  }

  getBucketBase(): string {
    return this._bucketBase;
  }
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
