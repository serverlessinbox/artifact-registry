import * as path from 'path';
import type { S3ArtifactEntry, S3WorkspaceConfig } from './types';

/**
 * Loads the S3 workspace configuration from artifact-tools.cjs
 */
export function loadConfig(cwd: string): S3WorkspaceConfig {
  return require(path.join(cwd, 'artifact-tools.cjs'));
}

/**
 * Selects an artifact from the config by objectName
 */
export function selectArtifact(
  config: S3WorkspaceConfig,
  objectName: string,
): S3ArtifactEntry | undefined {
  return config.artifacts.find(a => a.objectName === objectName);
}

/**
 * Constructs an S3 key for a release artifact
 */
export function buildReleaseKey(basePath: string, version: string, objectName: string): string {
  return `${basePath}/releases/v${version}/${objectName}`;
}

/**
 * Constructs an S3 key for a channel artifact
 */
export function buildChannelKey(basePath: string, channel: string, objectName: string): string {
  return `${basePath}/channels/${channel}/${objectName}`;
}
