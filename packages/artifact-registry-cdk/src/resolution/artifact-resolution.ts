/**
 * Which registry bucket an artifact is read from.
 *
 * `REGIONAL` reads from the bucket of the region the stack is deployed in. `EDGE` reads from the
 * bucket of the registry's fixed edge region (`us-east-1`), which is where CloudFront and
 * Lambda@Edge artifacts must live regardless of the deployment region.
 */
export enum ArtifactZone {
  /** The bucket of the region the stack is deployed in. */
  REGIONAL = 'regional',
  /** The bucket of the registry's fixed edge region (`us-east-1`). */
  EDGE = 'edge',
}

/**
 * Where a registry's artifacts live: how its buckets are named and which key prefix leads every
 * object. The same values the registry record of an `ArtifactRegistryBuckets` deployment holds.
 */
export interface RegistryLocation {
  /**
   * The name every region's bucket starts with; the bucket of a region is `{bucketBase}-{region}`
   * unless `bucketOverrides` names it. Copy it from the registry record of the registry you read
   * from. A wrong value makes every artifact resolve to a bucket that does not exist.
   */
  readonly bucketBase: string;

  /**
   * The key prefix that leads every object in the registry's buckets. Copy it from the registry
   * record of the registry you read from. A wrong value resolves keys that no object has.
   */
  readonly project: string;

  /**
   * Bucket names that replace the `{bucketBase}-{region}` convention name, keyed by region. Omit
   * it when every bucket follows the convention.
   *
   * @default - every bucket is named `{bucketBase}-{region}`
   */
  readonly bucketOverrides?: { [region: string]: string };
}

/**
 * The S3 location of one artifact object: the bucket, the object key and, when the object is
 * pinned to a specific S3 object version, that version ID.
 */
export interface ResolvedArtifact {
  /** The object key inside `bucket`. */
  readonly key: string;

  /** The name of the bucket that holds the object. */
  readonly bucket: string;

  /**
   * The S3 object version ID the object is pinned to. Present only when the resolver was given a
   * version ID for this key; a Lambda deployed from a pinned object keeps running the pinned
   * bytes even when the key is overwritten.
   *
   * @default - the object is not pinned to a version
   */
  readonly versionId?: string;
}

/**
 * Pins one package to the artifacts a deployment reads: which version or channel, and which zone's
 * bucket. Set exactly one of `version` and `channel`; a pin with neither or both is rejected when
 * the resolver is built, naming the package.
 */
export interface ArtifactPin {
  /** The zone whose bucket the package is read from. */
  readonly zone: ArtifactZone;

  /**
   * The exact release version to read, for example `1.4.2`. Set it, or `channel`, never both.
   *
   * @default - the pin names a channel instead
   */
  readonly version?: string;

  /**
   * The mutable channel to read, for example `dev`. The objects under a channel are overwritten by
   * each publish to it; `getVersion` returns the channel name. Set it, or `version`, never both.
   *
   * @default - the pin names a release version instead
   */
  readonly channel?: string;

  /**
   * Reads the package from this region's bucket instead of the one the zone selects. Set it only
   * for a package that is published to a region other than its zone's.
   *
   * @default - the zone selects the region
   */
  readonly region?: string;
}

/**
 * Resolves the artifacts a stack deploys from to their S3 location, URL and ARN, per package.
 *
 * Constructs take this interface wherever they need an artifact, so the registry, the pinned
 * versions and the region logic are decided once, where the resolver is built, and not in each
 * construct. Every package-specific method throws for a package the resolver holds no pin for.
 */
export interface IArtifactResolver {
  /**
   * Where the registry's buckets are named and keyed. Every resolved artifact lives under this
   * location.
   */
  readonly location: RegistryLocation;

  /**
   * The bucket, key and, when pinned, the S3 object version ID of one object of a package.
   *
   * @param packageName the package the object belongs to; throws when the resolver has no pin for it
   * @param objectPath the path of the object inside the package's artifact, for example `lambdas/api.zip`
   */
  resolve(packageName: string, objectPath: string): ResolvedArtifact;

  /**
   * The HTTPS URL of one object of a package, with `?versionId=` appended when the object is
   * pinned to a version. Use it where CloudFormation or a service needs a URL, such as a nested
   * template URL.
   *
   * @param packageName the package the object belongs to; throws when the resolver has no pin for it
   * @param objectPath the path of the object inside the package's artifact
   */
  getUrl(packageName: string, objectPath: string): string;

  /**
   * The S3 ARN (`arn:aws:s3:::bucket/key`) of one object of a package. Use it to scope an IAM
   * statement to exactly that object.
   *
   * @param packageName the package the object belongs to; throws when the resolver has no pin for it
   * @param objectPath the path of the object inside the package's artifact
   */
  getArn(packageName: string, objectPath: string): string;

  /**
   * The version a package is pinned to: the release version, or the channel name for a channel pin.
   *
   * @param packageName the package to look up; throws when the resolver has no pin for it
   */
  getVersion(packageName: string): string;
}
