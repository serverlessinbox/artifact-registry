import * as t from 'typanion';
import { isRegionBucket } from './registry-location';

/** Artifact type. Determines the S3 key prefix ('packages', 'templates'). */
export const isArtifactType = t.isEnum(['package', 'template'] as const);

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

/** Identifies a package across projects and artifact types: `{project}::{artifactType}::{name}`. */
export function toArtifactPackageMapKey(pkg: ArtifactPackage): string {
  return `${pkg.project}::${pkg.artifactType}::${pkg.name}`;
}
