import type { ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
import { buildReleasePrefix, buildChannelPrefix, buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from '../artifacts/artifact-target';
import type { ArtifactType } from '../artifacts/artifact';
import { ZONE_REGIONS } from '../artifacts/registry-location';
import type { RegistryLocation } from '../artifacts/registry-location';
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
 * Synchronous lookup, per package name, of an object's S3 location, URL and ARN, the package's
 * pinned version and S3 version ID, and the registry location shared by all packages. Every
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
  /** Registry location (bucket naming and key prefix), shared across all packages. */
  getLocation(): RegistryLocation;
}

/**
 * Options for constructing an {@link ArtifactResolver}.
 */
export interface ArtifactResolverFactoryOptions {
  /** The parsed artifact-versions data. */
  readonly versions: ParsedArtifactVersions;
  /** The registry location that names each package's bucket and the key prefix. */
  readonly location: RegistryLocation;
  /** The deployment region. Used for 'regional' zone artifacts that name no region of their own. */
  readonly deploymentRegion: string;
  /** The artifact type (default: 'package'). */
  readonly artifactType?: ArtifactType;
  /** S3 key to S3 object version ID. `resolve()` adds the matching version ID to a resolved artifact whose key is listed. */
  readonly s3VersionMap?: Record<string, string>;
}

/**
 * {@link IArtifactResolver} over the packages of one artifact-versions file. Resolves every package
 * to its bucket and key prefix in the constructor. It does not read S3.
 */
export class ArtifactResolver implements IArtifactResolver {
  private readonly resolvedData: Record<string, ResolvedArtifactData>;
  private readonly regionMap: Record<string, string>;
  private readonly versionMap: Record<string, string>;
  private readonly location: RegistryLocation;
  private readonly s3VersionMap: Record<string, string>;

  constructor(options: ArtifactResolverFactoryOptions) {
    const { location } = options;
    const artifactType = options.artifactType ?? 'package';
    const resolved: Record<string, ResolvedArtifactData> = {};

    for (const [packageName, entry] of Object.entries(options.versions.packages)) {
      const region = resolvePackageRegion(entry, options.deploymentRegion);
      resolved[packageName] = resolveArtifactData(packageName, entry, location, region, artifactType);
    }

    this.resolvedData = Object.freeze(resolved);
    this.regionMap = createPackageRegionMap(options.versions, options.deploymentRegion);
    this.versionMap = Object.freeze(
      Object.fromEntries(
        Object.entries(options.versions.packages).map(([name, entry]) => [name, entry.version])
      )
    );
    this.location = location;
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
    const artifact = this.resolve(packageName, objectPath);
    return buildArtifactUrl(artifact.bucket, this.regionMap[packageName], artifact.key, artifact.versionId);
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

  getLocation(): RegistryLocation {
    return this.location;
  }
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
 * Maps each package name of the versions to the region its artifact resolves in (see
 * `resolvePackageRegion`).
 */
export function createPackageRegionMap(
  versions: ParsedArtifactVersions,
  deploymentRegion: string,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [packageName, entry] of Object.entries(versions.packages)) {
    result[packageName] = resolvePackageRegion(entry, deploymentRegion);
  }

  return Object.freeze(result);
}

/**
 * The region a package's artifact resolves in: the entry's own `region`, else the region of its
 * fixed-region zone, else the deployment region.
 */
function resolvePackageRegion(entry: ArtifactVersionsEntry, deploymentRegion: string): string {
  if (entry.region !== undefined) {
    return entry.region;
  }
  return entry.zone === 'edge' ? ZONE_REGIONS.edge : deploymentRegion;
}

/**
 * Resolves a single artifact entry to bucket and prefix: the channel prefix when the entry names a
 * channel, otherwise the release prefix of its version.
 */
function resolveArtifactData(
  packageName: string,
  entry: ArtifactVersionsEntry,
  location: RegistryLocation,
  region: string,
  artifactType: ArtifactType,
): ResolvedArtifactData {
  const bucket = buildArtifactBucketName(location, region);
  const prefix = entry.channel
    ? buildChannelPrefix(artifactType, packageName, entry.channel, location.project)
    : buildReleasePrefix(artifactType, packageName, entry.version, location.project);

  return {
    bucket,
    prefix,
  };
}
