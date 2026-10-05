// Artifact addressing (the S3 key, bucket, URL and ARN schema for packages and templates), the
// registry location that names the buckets, and the workspace config that declares what to publish.
export type { ArtifactType, ArtifactPackage, ArtifactRouting, ArtifactBuildResult } from './artifact';
export { isArtifactRouting, toArtifactPackageMapKey } from './artifact';
export { buildArtifacts } from './build-artifacts';
export { loadWorkspaceConfig } from './workspace-config';
export type { ArtifactKeySpec, ReleasePointerKeyOptions } from './artifact-key';
export type { S3WorkspaceConfig, S3ArtifactEntry } from './workspace-config';
export type { RegistryLocation, RegistryConfig, RegionBucket } from './registry-location';
export type { RegistryRecord } from './registry-record';
export { registryRecordKey, parseRegistryRecord, loadRegistryRecord } from './registry-record';
export { buildArtifactKey, buildReleasePointerKey } from './artifact-key';
export { buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from './artifact-target';
