import type { SemVer } from 'semver';
import type { ArtifactType, S3ArtifactEntry, S3WorkspaceConfig } from './types';

export type { ArtifactType };

const ARTIFACT_TYPE_PREFIX: Record<ArtifactType, string> = {
  package: 'packages',
  template: 'templates',
};
// Not exported — all key construction goes through buildArtifactKey.

export const CONFIG_FILENAME = 'artifact-registry.cjs';

/** Placeholder tokens for templated release keys. A runtime consumer substitutes these literal
 *  strings with the concrete version / object name (e.g. read from a release pointer). */
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
  opts?: { track?: string; distTag?: string; project?: string },
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

export type ArtifactKeySpec =
  | { type: 'release'; version: SemVer; objectName: string; project?: string }
  | { type: 'channel'; channel: string; objectName: string; project?: string }
  | { type: 'channel-prefix'; channel: string; project?: string }
  // Unified, track-scoped and global, distTag-named pointer. When `track` is present,
  // the pointer is track-scoped: `{project}/packages/{name}/releases/{track}/{distTag}.json`.
  // When `track` is absent, it is the global untracked pointer: `{project}/packages/{name}/releases/{distTag}.json`.
  // `distTag` is the npm dist-tag / GitVersion prerelease label (stable/beta/calendar) --
  // distinct from `channel` (the dev|release mutable-publish axis) and from `track` (major /
  // major.minor drift line).
  | { type: 'release-pointer'; track?: string; distTag?: string; project?: string }
  | { type: 'release-track'; track: string; objectName: string; project?: string }
  // Builds a release key with literal `{version}` / `{objectName}` placeholders instead of
  // concrete values, for callers that resolve the actual version/object at runtime.
  | { type: 'release-template'; project?: string };

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

export function loadConfig(cwd: string): S3WorkspaceConfig {
  const path = require('path') as any;
  return require(path.join(cwd, CONFIG_FILENAME));
}

export function selectArtifact(
  config: S3WorkspaceConfig,
  objectName: string,
): S3ArtifactEntry | undefined {
  return config.artifacts.find(a => a.objectName === objectName);
}
