import * as t from 'typanion';

const isArtifactZone = t.isEnum(['regional', 'edge'] as const);

/**
 * Zone designation for an artifact.
 * - 'regional': Use the deployment region's artifact bucket.
 * - 'edge': Always use us-east-1 for edge deployments.
 */
export type ArtifactZone = t.InferType<typeof isArtifactZone>;

/**
 * One package of an artifact-versions file: the `version` it is pinned to and the `zone` whose
 * bucket it is read from.
 */
export interface ArtifactVersionsEntry {
  readonly version: string;
  readonly zone: ArtifactZone;
  /** When set, the package resolves under this channel's prefix instead of the release prefix of `version`. */
  readonly channel?: string;
}

/**
 * The packages of an artifact-versions file, keyed by package name, plus an optional bucket base.
 */
export interface ParsedArtifactVersions {
  readonly packages: Record<string, ArtifactVersionsEntry>;
  /** Bucket name without region suffix. A resolver needs one from here or from its own override. */
  readonly bucketBase?: string;
}
