import type { SemVer } from 'semver';
import type { ArtifactType, S3ArtifactEntry, S3WorkspaceConfig } from './types';

export type { ArtifactType };

const ARTIFACT_TYPE_PREFIX: Record<ArtifactType, string> = {
  package: 'packages',
  template: 'templates',
};
// Not exported — all key construction goes through buildArtifactKey.

export const CONFIG_FILENAME = 'artifact-registry.cjs';

/** Default leading key segment for release/pointer specs. */
export const DEFAULT_PROJECT = 'serverlessinbox';
/** Default distTag (release line) for the unified pointer spec. */
export const DEFAULT_DIST_TAG = 'stable';

export type ArtifactKeySpec =
  | { type: 'release'; version: SemVer; objectName: string; project?: string }
  | { type: 'channel'; channel: string; objectName: string; project?: string }
  | { type: 'channel-prefix'; channel: string; project?: string }
  // Unified, track-scoped, distTag-named pointer. Replaces the former
  // 'release-pointer' (optional track, no project) + 'release-prerelease-pointer' (global,
  // untracked) split -- every distTag (stable/beta/calendar/...) is now track-scoped and lives
  // under the project prefix: `{project}/packages/{name}/releases/{track}/{distTag}.json`.
  // NB: `distTag` is the npm dist-tag / GitVersion prerelease label (stable/beta/calendar) --
  // distinct from `channel` (the dev|release mutable-publish axis) and from `track` (major /
  // major.minor drift line).
  | { type: 'release-pointer'; track: string; distTag?: string; project?: string }
  | { type: 'release-track'; track: string; objectName: string; project?: string };

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
      const project = spec.project ?? DEFAULT_PROJECT;
      const distTag = spec.distTag ?? DEFAULT_DIST_TAG;
      return `${project}/${base}/releases/${spec.track}/${distTag}.json`;
    }
    case 'release-track': {
      const project = spec.project ?? DEFAULT_PROJECT;
      return `${project}/${base}/releases/${spec.track}/${spec.objectName}`;
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
