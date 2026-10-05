import type { SemVer } from 'semver';
import { buildArtifactKey } from '../artifacts/artifact-key';
import type { ArtifactRouting } from '../artifacts/artifact';
import type { RegionBucket } from '../artifacts/registry-location';
import type { ReleasePointer } from './release-pointer';
import type { PackageRelease, ReleaseTrackCopy, ReleaseUpload } from './release';
import type { S3Uploader } from './uploader';

/** One region bucket that a publish operation failed for, with the error that stopped it. */
export interface RegionFailure {
  target: RegionBucket;
  cause: Error;
}

/** What happened for one region bucket during one fan-out: `failure` is set when its operation threw. */
interface RegionOutcome {
  target: RegionBucket;
  failure?: Error;
}

/**
 * A publish that did not complete in every region bucket. `succeeded` lists the buckets whose
 * operations all completed, `failed` the buckets that did not, each with its cause. Publishing is
 * idempotent, so running the same publish again completes the regions that failed.
 */
export class RegionPublishError extends Error {
  readonly succeeded: RegionBucket[];
  readonly failed: RegionFailure[];

  constructor(succeeded: RegionBucket[], failed: RegionFailure[]) {
    const failures = failed.map(f => `${f.target.bucketName} (${f.target.region}): ${f.cause.message}`);
    super(`publish failed for ${failed.length} bucket(s): ${failures.join('; ')}`);
    this.name = 'RegionPublishError';
    this.succeeded = succeeded;
    this.failed = failed;
  }
}

/**
 * Publishes artifacts to every region bucket of a package through one `S3Uploader` per region. It
 * owns fan-out, ordering and failure aggregation; a single-bucket write is the `S3Uploader`'s job.
 *
 * A release is written in two steps. First every object of every package is uploaded to every one
 * of the package's buckets. Only when all of those uploads succeeded are the version pointers and
 * the release-track copies written. A reader that finds a pointer in a region therefore always
 * finds the objects the pointer names in that region.
 *
 * Every operation runs in all of its regions to completion; a failure in one region never stops the
 * others, and is reported afterwards in a `RegionPublishError`.
 */
export class RegionalPublisher {
  constructor(private readonly uploaders: ReadonlyMap<string, S3Uploader>) {}

  /**
   * Publishes a whole release: all objects to all regions, then, only if every upload succeeded,
   * the pointers of every package and the release-track copies of template packages. Template
   * packages get the `latest` track, or the prerelease label for a prerelease.
   */
  async uploadRelease(upload: ReleaseUpload): Promise<void> {
    const objectOutcomes = await Promise.all(upload.packages.map(files => this.uploadObjects(files, upload.version)));
    throwIfFailed(objectOutcomes.flat());

    const track = upload.version.prerelease.length > 0 ? String(upload.version.prerelease[0]) : 'latest';
    const aliasOutcomes = await Promise.all(upload.packages.map(async files => {
      const release: PackageRelease = {
        package: files.package,
        targets: files.targets,
        objects: files.entries.map(entry => ({ name: entry.objectName })),
      };
      const pointerOutcomes = await this.writePointers(release, upload.version);
      const trackOutcomes = files.package.artifactType === 'template' ? await this.copyToTrack(files, track) : [];
      return [...pointerOutcomes, ...trackOutcomes];
    }));
    throwIfFailed(aliasOutcomes.flat());
  }

  /** Uploads one file to the channel path of every target of the routing. */
  async uploadChannel(routing: ArtifactRouting, channel: string, filePath: string): Promise<void> {
    const { artifactType, name, project } = routing.package;
    const key = buildArtifactKey(artifactType, name, { type: 'channel', channel, objectName: routing.objectName, project });
    const outcomes = await this.fanOut(routing.targets, (uploader, target) => uploader.upload(target.bucketName, key, filePath));
    throwIfFailed(outcomes);
  }

  /**
   * Writes the track-scoped, distTag-named pointer files for a release to every target: one global
   * (untracked), one at v{major} granularity, one at v{major}.{minor}. `distTag` is 'stable' for a
   * normal release, or the prerelease label (e.g. 'beta', 'calendar') for a prerelease.
   * The pointer body is built once, so every target receives the same `publishedAt`.
   *
   * `release.objects` declares every artifact published in this release (at least one), so a reader
   * of the pointer learns the object names from it.
   */
  async writeVersionPointers(release: PackageRelease, version: SemVer): Promise<void> {
    throwIfFailed(await this.writePointers(release, version));
  }

  /** Uploads one file to the same key in every target concurrently. */
  async uploadObject(targets: RegionBucket[], key: string, filePath: string): Promise<void> {
    const outcomes = await this.fanOut(targets, (uploader, target) => uploader.upload(target.bucketName, key, filePath));
    throwIfFailed(outcomes);
  }

  private async uploadObjects(files: ReleaseTrackCopy, version: SemVer): Promise<RegionOutcome[]> {
    const { artifactType, name, project } = files.package;
    return this.fanOut(files.targets, async (uploader, target) => {
      for (const entry of files.entries) {
        const key = buildArtifactKey(artifactType, name, { type: 'release', version, objectName: entry.objectName, project });
        await uploader.upload(target.bucketName, key, entry.filePath);
      }
    });
  }

  private async writePointers(release: PackageRelease, version: SemVer): Promise<RegionOutcome[]> {
    const { artifactType, name, project } = release.package;
    const pointer: ReleasePointer = { version: version.version, publishedAt: new Date().toISOString(), objects: release.objects };
    const distTag = version.prerelease.length > 0 ? String(version.prerelease[0]) : undefined;
    const { major, minor } = version;
    const keys = [
      buildArtifactKey(artifactType, name, { type: 'release-pointer', distTag, project }),
      buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}`, distTag, project }),
      buildArtifactKey(artifactType, name, { type: 'release-pointer', track: `v${major}.${minor}`, distTag, project }),
    ];
    return this.fanOut(release.targets, async (uploader, target) => {
      for (const key of keys) {
        await uploader.uploadJson(target.bucketName, key, pointer);
      }
    });
  }

  private async copyToTrack(copy: ReleaseTrackCopy, track: string): Promise<RegionOutcome[]> {
    const { artifactType, name, project } = copy.package;
    return this.fanOut(copy.targets, async (uploader, target) => {
      for (const entry of copy.entries) {
        const key = buildArtifactKey(artifactType, name, { type: 'release-track', track, objectName: entry.objectName, project });
        await uploader.upload(target.bucketName, key, entry.filePath);
      }
    });
  }

  private async fanOut(targets: RegionBucket[], operation: (uploader: S3Uploader, target: RegionBucket) => Promise<void>): Promise<RegionOutcome[]> {
    return Promise.all(targets.map(async (target): Promise<RegionOutcome> => {
      try {
        await operation(this.uploaderFor(target), target);
        return { target };
      } catch (err: unknown) {
        return { target, failure: err instanceof Error ? err : new Error(String(err)) };
      }
    }));
  }

  private uploaderFor(target: RegionBucket): S3Uploader {
    const uploader = this.uploaders.get(target.region);
    if (uploader === undefined) {
      throw new Error(`no S3 uploader for region ${target.region}`);
    }
    return uploader;
  }
}

function throwIfFailed(outcomes: RegionOutcome[]): void {
  const failed: RegionFailure[] = [];
  for (const outcome of outcomes) {
    if (outcome.failure !== undefined) {
      failed.push({ target: outcome.target, cause: outcome.failure });
    }
  }
  if (failed.length === 0) {
    return;
  }

  const failedBuckets = new Set(failed.map(f => f.target.bucketName));
  const succeeded = new Map<string, RegionBucket>();
  for (const outcome of outcomes) {
    if (!failedBuckets.has(outcome.target.bucketName)) {
      succeeded.set(outcome.target.bucketName, outcome.target);
    }
  }
  throw new RegionPublishError([...succeeded.values()], failed);
}
