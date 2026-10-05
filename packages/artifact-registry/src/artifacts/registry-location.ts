import * as t from 'typanion';

/** A string with at least one character. */
const isNonEmptyString = t.cascade(t.isString(), [t.hasMinLength(1)]);

/** An S3 bucket name: 3 to 63 lowercase letters, digits, dots or hyphens, starting and ending with a letter or digit. */
const isBucketName = t.cascade(t.isString(), [t.matchesRegExp(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)]);

/** One or more distinct region names. */
export const isRegionList = t.cascade(t.isArray(isNonEmptyString), [t.hasMinLength(1), t.hasUniqueItems()]);

/**
 * Where an artifact is published, by zone.
 * - 'regional': the registry's regions.
 * - 'edge': the edge region only (see `ZONE_REGIONS`).
 */
export const isArtifactZone = t.isEnum(['regional', 'edge'] as const);

/** The one region each fixed-region zone is published to. The 'regional' zone has no entry: it follows the registry's regions. */
export const ZONE_REGIONS = { edge: 'us-east-1' } as const;

export const isRegistryLocation = t.isObject({
  bucketBase: isNonEmptyString,
  project: isNonEmptyString,
  bucketOverrides: t.isOptional(t.isRecord(isBucketName)),
});

/**
 * Everything needed to name a registry bucket and its key prefix: the `bucketBase` that every
 * region's bucket name starts with (`{bucketBase}-{region}`), the `project` that leads every object
 * key, and optional per-region bucket names that replace the convention name.
 * It is not a list of regions: which regions to use is decided by whoever holds the location.
 */
export type RegistryLocation = t.InferType<typeof isRegistryLocation>;

export const isRegistryConfig = t.isObject({
  ...isRegistryLocation.properties,
  regions: isRegionList,
});

/**
 * The registry block of a workspace config: a `RegistryLocation` plus the `regions` an artifact is
 * published to when it names neither its own `regions` nor a fixed-region `zone`.
 */
export type RegistryConfig = t.InferType<typeof isRegistryConfig>;

export const isRegionBucket = t.isObject({
  region: isNonEmptyString,
  bucketName: isBucketName,
});

/** One publish destination: a region and the name of that region's bucket. */
export type RegionBucket = t.InferType<typeof isRegionBucket>;
