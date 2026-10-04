import type { SemVer } from 'semver';
import type { ArtifactType } from './artifact';
import type { S3ArtifactEntry, S3WorkspaceConfig } from './workspace-config';

export type { ArtifactType };

/** Optional parts of a release pointer key: the track scope, the release line and the leading key segment. */
export interface ReleasePointerKeyOptions {
  track?: string;
  distTag?: string;
  project?: string;
}

interface ReleaseKeySpec {
  type: 'release';
  version: Pick<SemVer, 'version'>;
  objectName: string;
  project?: string;
}

interface ChannelKeySpec {
  type: 'channel';
  channel: string;
  objectName: string;
  project?: string;
}

interface ChannelPrefixKeySpec {
  type: 'channel-prefix';
  channel: string;
  project?: string;
}

// distTag-named pointer. With `track` it is track-scoped:
// `{project}/{typePrefix}/{name}/releases/{track}/{distTag}.json`. Without `track` it is the global
// untracked pointer: `{project}/{typePrefix}/{name}/releases/{distTag}.json`.
// `distTag` names the release line (the npm dist-tag / GitVersion prerelease label, e.g. stable,
// beta, calendar); `track` is the major or major.minor line; `channel` is a separate, mutable path.
interface ReleasePointerKeySpec extends ReleasePointerKeyOptions {
  type: 'release-pointer';
}

interface ReleaseTrackKeySpec {
  type: 'release-track';
  track: string;
  objectName: string;
  project?: string;
}

// A release key with the literal `{version}` / `{objectName}` tokens instead of concrete values.
interface ReleaseTemplateKeySpec {
  type: 'release-template';
  project?: string;
}

/**
 * Which kind of S3 key `buildArtifactKey` builds. Each variant takes an optional `project` that
 * replaces the default leading key segment.
 */
export type ArtifactKeySpec =
  | ReleaseKeySpec
  | ChannelKeySpec
  | ChannelPrefixKeySpec
  | ReleasePointerKeySpec
  | ReleaseTrackKeySpec
  | ReleaseTemplateKeySpec;

const ARTIFACT_TYPE_PREFIX: Record<ArtifactType, string> = {
  package: 'packages',
  template: 'templates',
};

/** Literal tokens that the 'release-template' key spec emits in place of the version and the object name. */
export const VERSION_PLACEHOLDER = '{version}';
export const OBJECT_NAME_PLACEHOLDER = '{objectName}';

/** Default leading key segment for release/pointer specs. */
export const DEFAULT_PROJECT = 'serverlessinbox';
/** Default distTag (release line) for the unified pointer spec. */
export const DEFAULT_DIST_TAG = 'stable';

/**
 * Build the S3 key for a release pointer file.
 * Pointer: `{project}/{typePrefix}/{name}/releases/{track}/{distTag}.json` (track-scoped)
 *          or `{project}/{typePrefix}/{name}/releases/{distTag}.json` (global, no track).
 */
export function buildReleasePointerKey(
  artifactType: ArtifactType,
  name: string,
  opts?: ReleasePointerKeyOptions,
): string {
  const typePrefix = ARTIFACT_TYPE_PREFIX[artifactType];
  const base = `${typePrefix}/${name}`;
  const project = opts?.project ?? DEFAULT_PROJECT;
  const distTag = opts?.distTag ?? DEFAULT_DIST_TAG;
  const track = opts?.track;

  if (track) {
    return `${project}/${base}/releases/${track}/${distTag}.json`;
  }
  return `${project}/${base}/releases/${distTag}.json`;
}

/**
 * Build the S3 key for an artifact of the given type and name, in the layout the `spec` selects.
 * Every writer and reader of these objects builds keys here, so a change to a layout changes where
 * existing objects are looked up.
 */
export function buildArtifactKey(
  artifactType: ArtifactType,
  name: string,
  spec: ArtifactKeySpec,
): string {
  const prefix = ARTIFACT_TYPE_PREFIX[artifactType];
  const base = `${prefix}/${name}`;
  switch (spec.type) {
    case 'release': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/releases/v${spec.version.version}/${spec.objectName}`;
    }
    case 'channel': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/channels/${spec.channel}/${spec.objectName}`;
    }
    case 'channel-prefix': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/channels/${spec.channel}/`;
    }
    case 'release-pointer': {
      return buildReleasePointerKey(artifactType, name, {
        track: spec.track,
        distTag: spec.distTag,
        project: spec.project,
      });
    }
    case 'release-track': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/releases/${spec.track}/${spec.objectName}`;
    }
    case 'release-template': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/releases/v${VERSION_PLACEHOLDER}/${OBJECT_NAME_PLACEHOLDER}`;
    }
  }
}

/** The artifact entry of the workspace config whose `objectName` matches, or undefined when none does. */
export function selectArtifact(
  config: S3WorkspaceConfig,
  objectName: string,
): S3ArtifactEntry | undefined {
  return config.artifacts.find(a => a.objectName === objectName);
}
