// Resolution: the pure, S3-SDK-free lookup of an artifact's bucket, key, URL and ARN from an
// artifact-versions file.
export { ArtifactResolver } from './artifact-resolver';
export type { ResolvedArtifact, ArtifactResolverFactoryOptions } from './artifact-resolver';
export type { ArtifactZone, ArtifactVersionsEntry, ParsedArtifactVersions } from './artifact-versions';
export { buildArtifactUrl, buildArtifactArn } from './artifact-target';
