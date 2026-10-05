import type * as t from 'typanion';
import type { isArtifactZone } from '../artifacts/registry-location';

/**
 * Zone designation for an artifact.
 * - 'regional': the deployment region's artifact bucket.
 * - 'edge': the bucket of the edge zone's fixed region (see `ZONE_REGIONS`).
 */
export type ArtifactZone = t.InferType<typeof isArtifactZone>;

/**
 * One package of an artifact-versions file: the `version` it is pinned to and the `zone` whose
 * bucket it is read from.
 */
export interface ArtifactVersionsEntry {
  readonly version: string;
  readonly zone: ArtifactZone;
  /** When set, the package is read from this region's bucket; it wins over `zone`. */
  readonly region?: string;
  /** When set, the package resolves under this channel's prefix instead of the release prefix of `version`. */
  readonly channel?: string;
}

/**
 * The packages of an artifact-versions file, keyed by package name.
 */
export interface ParsedArtifactVersions {
  readonly packages: Record<string, ArtifactVersionsEntry>;
}
