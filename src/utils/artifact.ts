import * as t from 'typanion';

/** Artifact type. Determines the S3 key prefix ('packages', 'templates'). */
export const isArtifactType = t.isEnum(['package', 'template'] as const);

export type ArtifactType = t.InferType<typeof isArtifactType>;

/** The published package an artifact belongs to: the bucket it is published in, its artifact type and its package name. */
export const isArtifactPackage = t.isObject({
  bucketName: t.isString(),
  artifactType: isArtifactType,
  name: t.isString(),
});

export type ArtifactPackage = t.InferType<typeof isArtifactPackage>;

/** Where a built artifact file is published: its package, object name and region. */
export const isArtifactRouting = t.isObject({
  package: isArtifactPackage,
  objectName: t.isString(),
  region: t.isOptional(t.isString()),
});

export type ArtifactRouting = t.InferType<typeof isArtifactRouting>;

/**
 * Result of building artifacts: the basenames of the files written to the output folder, and for
 * each basename where that file is published.
 */
export interface ArtifactBuildResult {
  outputFiles: string[];
  routingMap: Map<string, ArtifactRouting>;
}

export function toArtifactPackageMapKey(pkg: ArtifactPackage): string {
  return `${pkg.bucketName}::${pkg.artifactType}::${pkg.name}`;
}
