import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ArtifactSelectionError } from './artifact';
import type { StagedFile } from './artifact';
import { selectArtifact } from './artifact-key';
import { buildArtifacts } from './build-artifacts';
import { loadWorkspaceConfig } from './workspace-config';
import type { S3WorkspaceConfig } from './workspace-config';
import { hasErrorCode } from '../utils/error-code';

/** Which artifacts of a workspace to stage: the workspace directory, an optional single `objectName`, and the regions to restrict the targets to (all targets when empty). */
export interface ArtifactSelection {
  cwd: string;
  objectName?: string;
  regions: string[];
}

/**
 * Stages the selected artifacts the way the gitversion plugin's pack does (`buildArtifacts`: a
 * directory is zipped, a `js-zip` entry is bundled, a file is copied) into a temporary folder, hands
 * the staged files to `use`, and removes the folder afterwards, also when `use` throws.
 * Throws an `ArtifactSelectionError` when the config is missing, `objectName` matches no entry, or a
 * selected region is no target of any selected entry.
 */
export async function withStagedArtifacts<T>(
  selection: ArtifactSelection,
  use: (files: StagedFile[]) => Promise<T>,
): Promise<T> {
  const config = await loadSelectedConfig(selection);
  const stagingFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-registry-stage-'));
  try {
    const built = await buildArtifacts(selection.cwd, stagingFolder, config);
    const staged = [...built.routingMap].map(([basename, routing]): StagedFile => ({
      filePath: path.join(stagingFolder, basename),
      routing,
    }));
    return await use(restrictToRegions(staged, selection.regions));
  } finally {
    await fs.rm(stagingFolder, { recursive: true, force: true });
  }
}

async function loadSelectedConfig(selection: ArtifactSelection): Promise<S3WorkspaceConfig> {
  let config: S3WorkspaceConfig;
  try {
    config = await loadWorkspaceConfig(selection.cwd);
  } catch (err: unknown) {
    if (hasErrorCode(err, 'ENOENT')) {
      throw new ArtifactSelectionError(`artifact-registry.json not found in ${selection.cwd}`);
    }
    throw err;
  }

  if (selection.objectName !== undefined) {
    const entry = selectArtifact(config, selection.objectName);
    if (!entry) {
      throw new ArtifactSelectionError(`no artifact with objectName '${selection.objectName}' found`);
    }
    return { ...config, artifacts: [entry] };
  }
  if (config.artifacts.length === 0) {
    throw new ArtifactSelectionError('no artifacts found');
  }
  return config;
}

function restrictToRegions(files: StagedFile[], regions: string[]): StagedFile[] {
  if (regions.length === 0) {
    return files;
  }

  const available = new Set(files.flatMap(file => file.routing.targets.map(target => target.region)));
  const unmatched = regions.filter(region => !available.has(region));
  if (unmatched.length > 0) {
    throw new ArtifactSelectionError(`--region ${unmatched.join(', ')} matches no target of the selected artifacts (targets: ${[...available].join(', ')})`);
  }

  return files
    .map((file): StagedFile => ({
      filePath: file.filePath,
      routing: { ...file.routing, targets: file.routing.targets.filter(target => regions.includes(target.region)) },
    }))
    .filter(file => file.routing.targets.length > 0);
}
