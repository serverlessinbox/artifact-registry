import {
  ArtifactResolver,
  type ArtifactVersionsEntry,
  type ArtifactZone as CoreArtifactZone,
} from '@serverlessinbox/artifact-registry/resolution';
import type { Construct } from 'constructs';
import * as t from 'typanion';
import {
  ArtifactZone,
  type ArtifactPin,
  type IArtifactResolver,
  type RegistryLocation,
  type ResolvedArtifact,
} from './artifact-resolution';

const isNonEmptyString = t.cascade(t.isString(), [t.hasMinLength(1)]);

const isArtifactPin = t.isObject({
  zone: t.isEnum(ArtifactZone),
  version: t.isOptional(isNonEmptyString),
  channel: t.isOptional(isNonEmptyString),
  region: t.isOptional(isNonEmptyString),
});

const isArtifactPins = t.isRecord(isArtifactPin);

const isArtifactsContext = t.isObject({
  bucketBase: t.isOptional(isNonEmptyString),
  project: t.isOptional(isNonEmptyString),
  bucketOverrides: t.isOptional(t.isRecord(t.isString())),
  packages: t.isOptional(isArtifactPins),
});

/** The value of the artifacts CDK context key: location fields that replace the default's, and pins that replace or add to the default pins. */
type ArtifactsContext = t.InferType<typeof isArtifactsContext>;

const isObjectVersionIds = t.isRecord(t.isString());

/** The pin of each package, keyed by package name. */
type PackagePins = { [packageName: string]: ArtifactPin };

/**
 * Inputs of a {@link PinnedArtifactResolver}.
 */
export interface PinnedArtifactResolverProps {
  /**
   * The pin of every package the resolver can resolve, keyed by package name. A package without a
   * pin cannot be resolved: resolving it throws `No resolved data for package '<name>'`. Each pin
   * sets exactly one of `version` and `channel`; the constructor throws naming the package
   * otherwise.
   */
  readonly packages: { [packageName: string]: ArtifactPin };

  /**
   * Where the registry's buckets are named and keyed. Take it from the registry record of the
   * registry the artifacts were published to.
   */
  readonly location: RegistryLocation;

  /**
   * The region the stack is deployed in. A package whose pin sets no `region` and whose zone is
   * `REGIONAL` is read from this region's bucket. It may be a CloudFormation token such as the
   * stack's region, in which case the bucket name is a token too.
   */
  readonly deploymentRegion: string;

  /**
   * S3 object version IDs by object key. An object whose key is listed resolves with its version
   * ID, so a deployment keeps reading the bytes that were current when the IDs were captured even
   * when the key is overwritten, which a channel object is on every publish.
   *
   * @default - no object is pinned to an S3 object version
   */
  readonly objectVersionIds?: { [s3Key: string]: string };
}

/**
 * Inputs of {@link PinnedArtifactResolver.fromContext}.
 */
export interface PinnedArtifactContextProps {
  /**
   * The pins used for every package the CDK context does not name. Ship them with your package
   * (for example in a baked JSON file read with {@link PinnedArtifactResolver.parsePins}) so a
   * synthesis needs no CDK context at all.
   */
  readonly defaultPins: { [packageName: string]: ArtifactPin };

  /**
   * The registry location used for every field the CDK context does not set. Take it from the
   * registry record of the registry the default pins were published to.
   */
  readonly defaultLocation: RegistryLocation;

  /**
   * The CDK context key that holds the override of location and pins, an object with the optional
   * fields `bucketBase`, `project`, `bucketOverrides` and `packages` (package name to pin). Each
   * location field present replaces the default's field; each pin present replaces the default pin
   * of the same package, and a pin for a package without a default pin is added. A present value
   * that does not have this shape makes `fromContext` throw, naming the key and the value.
   */
  readonly artifactsContextKey: string;

  /**
   * The CDK context key that holds S3 object version IDs by object key (an object of strings). A
   * present value that is not an object of strings makes `fromContext` throw, naming the key and
   * the value.
   */
  readonly objectVersionsContextKey: string;

  /**
   * The region the stack is deployed in; see {@link PinnedArtifactResolverProps.deploymentRegion}.
   */
  readonly deploymentRegion: string;
}

/**
 * An {@link IArtifactResolver} over a fixed set of pins: each package is pinned to one release
 * version or one channel, and read from the bucket of its zone. It reads nothing from S3 and holds
 * no state beyond its pins.
 *
 * Build it directly from pins you hold, or with {@link PinnedArtifactResolver.fromContext} to ship
 * default pins with your package and let CDK context override them during development.
 */
export class PinnedArtifactResolver implements IArtifactResolver {
  private static readonly CORE_ZONES: Record<ArtifactZone, CoreArtifactZone> = {
    [ArtifactZone.REGIONAL]: 'regional',
    [ArtifactZone.EDGE]: 'edge',
  };

  /** Where the registry's buckets are named and keyed. */
  readonly location: RegistryLocation;

  private readonly resolver: ArtifactResolver;

  /**
   * @param props the pins, the registry location, the deployment region and optional object version IDs
   * @throws an error naming the package when a pin sets neither or both of `version` and `channel`
   */
  constructor(props: PinnedArtifactResolverProps) {
    this.location = props.location;
    this.resolver = new ArtifactResolver({
      versions: { packages: PinnedArtifactResolver.toCoreEntries(props.packages) },
      location: props.location,
      deploymentRegion: props.deploymentRegion,
      s3VersionMap: { ...props.objectVersionIds },
    });
  }

  /**
   * Parses and validates pins from JSON text, for example a file shipped with your package.
   *
   * The text is an object that maps a package name to its pin: `{ "<package>": { "zone":
   * "regional" | "edge", "version": "<semver>" } }`, or `"channel": "<name>"` in place of
   * `"version"`, and optionally `"region"`. Locating and reading the file is the caller's job.
   *
   * @param json the JSON text to parse
   * @param source where the text came from, such as a file path; every error message names it
   * @throws an error naming `source` and the offending package and field when the text is not
   *   valid JSON, a pin has a missing or unknown `zone` or a field of the wrong type, or a pin sets
   *   neither or both of `version` and `channel`
   */
  static parsePins(json: string, source: string): { [packageName: string]: ArtifactPin } {
    const parsed = PinnedArtifactResolver.parseJson(json, source);
    const errors: string[] = [];
    if (!isArtifactPins(parsed, { errors })) {
      throw new Error(`Invalid artifact pins in ${source}: ${errors.join('; ')}`);
    }
    PinnedArtifactResolver.requireVersionOrChannel(parsed, `Invalid artifact pins in ${source}`);
    return parsed;
  }

  /**
   * Builds a resolver from default pins and a default location, overridden by CDK context.
   *
   * With no context set, the resolver holds exactly the defaults. Context is an override layer for
   * development and never required.
   *
   * @param scope any construct of the app; its CDK context is read
   * @param props the defaults, the two context keys and the deployment region
   * @throws an error naming the context key and value when a present context value is invalid,
   *   including a context pin without a `zone`
   */
  static fromContext(scope: Construct, props: PinnedArtifactContextProps): PinnedArtifactResolver {
    const artifacts = PinnedArtifactResolver.readArtifactsContext(scope, props.artifactsContextKey);
    const objectVersionIds = PinnedArtifactResolver.readObjectVersionIds(scope, props.objectVersionsContextKey);
    const bucketOverrides = artifacts?.bucketOverrides ?? props.defaultLocation.bucketOverrides;
    const location: RegistryLocation = {
      bucketBase: artifacts?.bucketBase ?? props.defaultLocation.bucketBase,
      project: artifacts?.project ?? props.defaultLocation.project,
      ...(bucketOverrides !== undefined ? { bucketOverrides } : {}),
    };
    return new PinnedArtifactResolver({
      packages: { ...props.defaultPins, ...artifacts?.packages },
      location,
      deploymentRegion: props.deploymentRegion,
      objectVersionIds,
    });
  }

  /**
   * The bucket, key and, when pinned, the S3 object version ID of one object of a package.
   *
   * @param packageName the package the object belongs to; throws `No resolved data for package` when it has no pin
   * @param objectPath the path of the object inside the package's artifact
   */
  resolve(packageName: string, objectPath: string): ResolvedArtifact {
    return this.resolver.resolve(packageName, objectPath);
  }

  /**
   * The HTTPS URL of one object of a package, with `?versionId=` appended when it is pinned to a version.
   *
   * @param packageName the package the object belongs to; throws `No resolved data for package` when it has no pin
   * @param objectPath the path of the object inside the package's artifact
   */
  getUrl(packageName: string, objectPath: string): string {
    return this.resolver.getUrl(packageName, objectPath);
  }

  /**
   * The S3 ARN of one object of a package.
   *
   * @param packageName the package the object belongs to; throws `No resolved data for package` when it has no pin
   * @param objectPath the path of the object inside the package's artifact
   */
  getArn(packageName: string, objectPath: string): string {
    return this.resolver.getArn(packageName, objectPath);
  }

  /**
   * The release version a package is pinned to, or the channel name for a channel pin.
   *
   * @param packageName the package to look up; throws `No resolved data for package` when it has no pin
   */
  getVersion(packageName: string): string {
    return this.resolver.getVersion(packageName);
  }

  private static requireVersionOrChannel(packages: PackagePins, origin: string): void {
    for (const [packageName, pin] of Object.entries(packages)) {
      PinnedArtifactResolver.selectTarget(packageName, pin, origin);
    }
  }

  private static selectTarget(
    packageName: string,
    pin: ArtifactPin,
    origin: string,
  ): Pick<ArtifactVersionsEntry, 'version' | 'channel'> {
    if (pin.version !== undefined && pin.channel === undefined) {
      return { version: pin.version };
    }
    if (pin.channel !== undefined && pin.version === undefined) {
      return { version: pin.channel, channel: pin.channel };
    }
    throw new Error(`${origin}: package '${packageName}' must set exactly one of 'version' and 'channel'`);
  }

  private static toCoreEntries(packages: PackagePins): Record<string, ArtifactVersionsEntry> {
    const entries: Record<string, ArtifactVersionsEntry> = {};
    for (const [packageName, pin] of Object.entries(packages)) {
      entries[packageName] = {
        ...PinnedArtifactResolver.selectTarget(packageName, pin, 'Invalid artifact pins'),
        zone: PinnedArtifactResolver.CORE_ZONES[pin.zone],
        ...(pin.region !== undefined ? { region: pin.region } : {}),
      };
    }
    return entries;
  }

  private static parseJson(json: string, source: string): unknown {
    try {
      return JSON.parse(json);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid artifact pins in ${source}: not valid JSON: ${reason}`);
    }
  }

  private static readArtifactsContext(scope: Construct, key: string): ArtifactsContext | undefined {
    const value: unknown = scope.node.tryGetContext(key);
    if (value === undefined) {
      return undefined;
    }
    const errors: string[] = [];
    if (!isArtifactsContext(value, { errors })) {
      throw new Error(`Invalid CDK context value for "${key}": ${JSON.stringify(value)}: ${errors.join('; ')}`);
    }
    if (value.packages !== undefined) {
      PinnedArtifactResolver.requireVersionOrChannel(
        value.packages,
        `Invalid CDK context value for "${key}": ${JSON.stringify(value)}`,
      );
    }
    return value;
  }

  private static readObjectVersionIds(scope: Construct, key: string): { [s3Key: string]: string } {
    const value: unknown = scope.node.tryGetContext(key);
    if (value === undefined) {
      return {};
    }
    const errors: string[] = [];
    if (!isObjectVersionIds(value, { errors })) {
      throw new Error(`Invalid CDK context value for "${key}": ${JSON.stringify(value)}: ${errors.join('; ')}`);
    }
    return value;
  }
}
