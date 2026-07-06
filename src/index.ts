export { S3ArtifactPlugin } from './s3-artifact-plugin';
export { S3Uploader } from './utils/uploader';
export type { S3WorkspaceConfig, S3ArtifactEntry } from './utils/types';
export { buildArtifacts } from './utils/build-artifacts';
export type { ArtifactBuildResult } from './utils/types';
export { loadChannelVersions } from './utils/load-channel';
export type { ChannelVersionsOptions } from './utils/load-channel';
export { loadTrackVersions } from './utils/load-track';
export type { TrackVersionsOptions, TrackVersionsResult } from './utils/load-track';
export { loadPrereleaseVersions } from './utils/load-prerelease';
export type { PrereleaseVersionsOptions } from './utils/load-prerelease';
export type { ArtifactType } from './utils/types';
export type { ArtifactTarget, ReleaseTarget, ChannelTarget, TrackTarget } from './utils/artifact-target';
export { buildReleasePrefix, buildChannelPrefix, buildArtifactBucketName, buildArtifactUrl, buildArtifactArn } from './utils/artifact-target';
export type { ResolvedArtifact, IArtifactRegistry } from './utils/artifact-registry';
export { S3ArtifactRegistry } from './utils/artifact-registry';
export { readArtifactVersions } from './utils/artifact-versions';
export type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './utils/artifact-versions';
export { ArtifactResolver, createPackageRegionMap, resolveArtifact } from './utils/artifact-resolver-factory';
export type { IArtifactResolver, ResolvedArtifactData, ArtifactResolverFactoryOptions } from './utils/artifact-resolver-factory';

// Track resolver: TrackResolver construct and types (deployed as CFN custom resource)
export {
  TRACK_RESOLVER_HANDLER_SOURCE,
  TRACK_RESOLVER_VERSION_ATTR,
  buildTrackResolverProperties,
} from './track-resolver';
export type { TrackResolverPropertiesInput } from './track-resolver';
export { buildArtifactKey, buildReleasePointerKey } from './utils/artifact-key';
export type { LatestStablePointer, LatestStableObject } from './utils/types';
