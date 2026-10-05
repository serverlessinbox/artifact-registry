import type { RegionBucket } from '../artifacts/registry-location';

/** One region bucket that a publish operation failed for, with the error that stopped it. */
export interface RegionFailure {
  target: RegionBucket;
  cause: Error;
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
