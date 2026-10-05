import type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
import { buildReleasePrefix, buildChannelPrefix, buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from '../artifacts/artifact-target';
import type { ArtifactType } from '../artifacts/artifact';
import type { ResolvedArtifact } from './artifact-registry';

/**
 * Resolved location of a single package: the bucket, the S3 key prefix its objects live under and,
 * when pinned, the S3 object version ID.
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
 * Synchronous lookup, per package name, of an object's S3 location, URL and ARN, the package's
 * pinned version and S3 version ID, and the bucket base shared by all packages. Every
 * package-specific method throws for a package the resolver does not know.
 */
export interface IArtifactResolver {
  resolve(packageName: string, objectPath: string): ResolvedArtifact;
  getUrl(packageName: string, objectPath: string): string;
  getArn(packageName: string, objectPath: string): string;
  /** Version string of the package's entry in the versions file, as written there. */
  getVersion(packageName: string): string;
  /** S3 version ID for the given package, or undefined if not pinned. */
  getVersionId(packageName: string): string | undefined;
  /** Bucket base (without region suffix), shared across all packages. */
  getBucketBase(): string;
}

/**
 * {@link IArtifactResolver} over the packages of one artifact-versions file. Resolves every package
 * to its bucket and key prefix in the constructor, so an unusable configuration (no bucket base)
 * fails at construction rather than on first use. It does not read S3.
 */
export class ArtifactResolver implements IArtifactResolver {
  private readonly resolvedData: Record<string, ResolvedArtifactData>;
  private readonly regionMap: Record<string, string>;
  private readonly versionMap: Record<string, string>;
  private readonly bucketBase: string;
  private readonly s3VersionMap: Record<string, string>;

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
      resolved[packageName] = resolveArtifactData(packageName, entry, bucketBase, options.deploymentRegion, artifactType, options.project);
      regionMap[packageName] = entry.zone === 'edge' ? 'us-east-1' : options.deploymentRegion;
    }

    this.resolvedData = Object.freeze(resolved);
    this.regionMap = Object.freeze(regionMap);
    this.versionMap = Object.freeze(
      Object.fromEntries(
        Object.entries(options.versions.packages).map(([name, entry]) => [name, entry.version])
      )
    );
    this.bucketBase = bucketBase;
    this.s3VersionMap = Object.freeze(options.s3VersionMap ?? {});
  }

  resolve(packageName: string, objectPath: string): ResolvedArtifact {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    const artifact = resolveArtifact(data, objectPath);
    const versionId = this.s3VersionMap[artifact.key];
    return versionId !== undefined ? { ...artifact, versionId } : artifact;
  }

  getUrl(packageName: string, objectPath: string): string {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    const resolved = resolveArtifact(data, objectPath);
    const region = this.regionMap[packageName];
    return buildArtifactUrl(data.bucket, region, resolved.key, data.versionId);
  }

  getArn(packageName: string, objectPath: string): string {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    const key = resolveArtifact(data, objectPath).key;
    return buildArtifactArn(data.bucket, key);
  }

  getVersion(packageName: string): string {
    const v = this.versionMap[packageName];
    if (v === undefined) throw new Error(`No resolved data for package '${packageName}'`);
    return v;
  }

  getVersionId(packageName: string): string | undefined {
    const data = this.resolvedData[packageName];
    if (!data) throw new Error(`No resolved data for package '${packageName}'`);
    return data.versionId;
  }

  getBucketBase(): string {
    return this.bucketBase;
  }
}

/**
 * Options for constructing an {@link ArtifactResolver}.
 */
export interface ArtifactResolverFactoryOptions {
  /** The parsed artifact-versions data (packages + optional bucketBase). */
  readonly versions: ParsedArtifactVersions;
  /** Bucket name without region suffix. Takes precedence over `versions.bucketBase`; construction throws when neither is set. */
  readonly bucketBaseOverride?: string;
  /** The deployment region (e.g. 'eu-west-1'). Used for 'regional' zone artifacts. */
  readonly deploymentRegion: string;
  /** The artifact type (default: 'package'). */
  readonly artifactType?: ArtifactType;
  /** S3 key to S3 object version ID. `resolve()` adds the matching version ID to a resolved artifact whose key is listed. */
  readonly s3VersionMap?: Record<string, string>;
  /** Optional override for the `{project}/` key prefix. Defaults to DEFAULT_PROJECT. */
  readonly project?: string;
}

/**
 * Resolves a single artifact entry to bucket and prefix: the channel prefix when the entry names a
 * channel, otherwise the release prefix of its version.
 */
function resolveArtifactData(
  packageName: string,
  entry: ArtifactVersionsEntry,
  bucketBase: string,
  deploymentRegion: string,
  artifactType: ArtifactType,
  project?: string,
): ResolvedArtifactData {
  const region = entry.zone === 'edge' ? 'us-east-1' : deploymentRegion;
  const bucket = buildArtifactBucketName(bucketBase, region);
  const prefix = entry.channel
    ? buildChannelPrefix(artifactType, packageName, entry.channel, project)
    : buildReleasePrefix(artifactType, packageName, entry.version, project);

  return {
    bucket,
    prefix,
  };
}

/**
 * Maps each package name of the versions to the region its artifact resolves in: us-east-1 for an
 * 'edge' zone entry, the deployment region otherwise.
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
