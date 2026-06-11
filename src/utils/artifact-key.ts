import * as path from 'path';
import type { SemVer } from 'semver';
import type { ArtifactType, S3ArtifactEntry, S3WorkspaceConfig } from './types';

export type { ArtifactType };

const ARTIFACT_TYPE_PREFIX: Record<ArtifactType, string> = {
  package: 'packages',
  template: 'templates',
};
// Not exported — all key construction goes through buildArtifactKey.

export type ArtifactKeySpec =
  | { type: 'release';                    version: SemVer; objectName: string }
  | { type: 'channel';                    channel: string; objectName: string }
  | { type: 'release-pointer';            track?: string                      }
  | { type: 'release-prerelease-pointer'; prereleaseTag: string               }
  | { type: 'channel-pointer';            channel: string                     }
  | { type: 'release-track';             track: string; objectName: string    };

export function buildArtifactKey(
  artifactType: ArtifactType,
  name: string,
  spec: ArtifactKeySpec,
): string {
  const prefix = ARTIFACT_TYPE_PREFIX[artifactType];
  const base = `${prefix}/${name}`;
  switch (spec.type) {
    case 'release':
      return `${base}/releases/v${spec.version.version}/${spec.objectName}`;
    case 'channel':
      return `${base}/channels/${spec.channel}/${spec.objectName}`;
    case 'release-pointer':
      return spec.track
        ? `${base}/releases/${spec.track}/latest-stable.json`
        : `${base}/releases/latest-stable.json`;
    case 'release-prerelease-pointer':
      return `${base}/releases/latest-${spec.prereleaseTag}.json`;
    case 'channel-pointer':
      return `${base}/channels/${spec.channel}/latest-stable.json`;
    case 'release-track':
      return `${base}/releases/${spec.track}/${spec.objectName}`;
  }
}

export function loadConfig(cwd: string): S3WorkspaceConfig {
  return require(path.join(cwd, 'artifact-tools.cjs'));
}

export function selectArtifact(
  config: S3WorkspaceConfig,
  objectName: string,
): S3ArtifactEntry | undefined {
  return config.artifacts.find(a => a.objectName === objectName);
}
