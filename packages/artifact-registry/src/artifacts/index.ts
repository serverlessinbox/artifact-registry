// Artifact addressing (the S3 key, bucket, URL and ARN schema for packages and templates) and the
// workspace config types that declare what to publish.
export type { ArtifactType, ArtifactPackage, ArtifactRouting, ArtifactBuildResult } from './artifact';
export { isArtifactRouting, toArtifactPackageMapKey } from './artifact';
export { buildArtifacts } from './build-artifacts';
export type { ArtifactKeySpec, ReleasePointerKeyOptions } from './artifact-key';
export type { S3WorkspaceConfig, S3ArtifactEntry } from './workspace-config';
export { buildArtifactKey, buildReleasePointerKey } from './artifact-key';
export { buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from './artifact-target';
