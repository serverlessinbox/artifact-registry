// Releases: pre-synth version loaders, artifact resolution from an artifact-versions file, release
// tracks and release pointers.
export { loadChannelVersions } from './load-channel';
export type { ChannelVersionsOptions } from './load-channel';
export { loadTrackVersions } from './load-track';
export type { TrackVersionsOptions, TrackVersionsResult } from './load-track';

export type { ResolvedArtifact } from './artifact-registry';
export type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
export { ArtifactResolver } from './artifact-resolver-factory';
export type { IArtifactResolver, ArtifactResolverFactoryOptions } from './artifact-resolver-factory';

export { deriveTrack } from './derive-track';
export type { ReleasePointer, ReleasePointerObject } from './release-pointer';
export { readReleasePointer } from './read-release-pointer';
export type { ReadReleasePointerOptions } from './read-release-pointer';
