import * as t from 'typanion';
import { isRegionBucket } from '../registry/registry-location';

export const isArtifactType = t.isEnum(['package', 'template'] as const);

/** Artifact type: `package` or `template`; selects the `packages` or `templates` key prefix. */
export type ArtifactType = t.InferType<typeof isArtifactType>;

export const isArtifactPackage = t.isObject({
  project: t.isString(),
  artifactType: isArtifactType,
  name: t.isString(),
});

/** The published package an artifact belongs to: the project that leads its object keys, its artifact type and its package name. */
export type ArtifactPackage = t.InferType<typeof isArtifactPackage>;

export const isArtifactRouting = t.isObject({
  package: isArtifactPackage,
  objectName: t.isString(),
  targets: t.isArray(isRegionBucket),
});

/** Where a built artifact file is published: its package, its object name and every region bucket it is uploaded to. */
export type ArtifactRouting = t.InferType<typeof isArtifactRouting>;

/**
 * Result of building artifacts: the basenames of the files written to the output folder, and for
 * each basename where that file is published.
 */
export interface ArtifactBuildResult {
  outputFiles: string[];
  routingMap: Map<string, ArtifactRouting>;
}

/** A built artifact file in a staging folder with where it is published; `routing.targets` is already restricted to the selected regions. */
export interface StagedFile {
  filePath: string;
  routing: ArtifactRouting;
}

/** A selection of artifacts that cannot be staged: no workspace config, an `objectName` no entry has, or a region no selected entry targets. The message states which. */
export class ArtifactSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactSelectionError';
  }
}

/** Identifies a package across projects and artifact types: `{project}::{artifactType}::{name}`. */
export function toArtifactPackageMapKey(pkg: ArtifactPackage): string {
  return `${pkg.project}::${pkg.artifactType}::${pkg.name}`;
}
