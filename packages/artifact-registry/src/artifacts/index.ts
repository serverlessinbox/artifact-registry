// Artifact addressing (the S3 key, URL and ARN schema for packages and templates), the registry
// record loader, and the workspace config that declares what to publish.
export type { ArtifactType, ArtifactPackage, ArtifactRouting, ArtifactBuildResult } from './artifact';
export { isArtifactRouting, toArtifactPackageMapKey } from './artifact';
export { buildArtifacts } from './build-artifacts';
export { loadWorkspaceConfig } from './workspace-config';
export type { ArtifactKeySpec, ReleasePointerKeyOptions } from './artifact-key';
export type { S3WorkspaceConfig, S3ArtifactEntry } from './workspace-config';
export { loadRegistryRecord } from './load-registry-record';
export { buildArtifactKey, buildReleasePointerKey } from './artifact-key';
export { buildArtifactUrl, buildArtifactArn } from './artifact-target';
