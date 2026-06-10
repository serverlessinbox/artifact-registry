import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import semver from 'semver';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage, PackResult, PackFileResult } from '@jwpkg/gitversion';
import { S3Uploader } from './utils/uploader';
import { run } from './utils/common';
import { loadConfig, buildArtifactKey } from './utils/artifact-key';
import type { S3ArtifactEntry, S3WorkspaceConfig, ArtifactMapEntry } from './utils/types';

class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  constructor() {}

  get packManager(): IPackManager {
    return this;
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<PackResult | null> {
    let config: S3WorkspaceConfig | undefined;
    try {
      config = loadConfig(workspace.cwd) as S3WorkspaceConfig;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
      // No config file for this workspace — skip silently
      return null;
    }

    if (!Array.isArray(config.artifacts)) {
      return null;
    }

    const files: PackFileResult[] = [];

    for (const entry of config.artifacts) {
      const resolved = path.isAbsolute(entry.source)
        ? entry.source
        : path.join(workspace.cwd, entry.source);

      const outputBasename = path.basename(entry.objectName);
      const outPath = path.join(outputFolder, outputBasename);

      let isDirectory = false;
      try {
        isDirectory = fssync.statSync(resolved).isDirectory();
      } catch {
        throw new Error(`[s3-artifact] Source not found: ${resolved}`);
      }

      if (isDirectory) {
        run('zip', ['-r', outPath, '.'], { cwd: resolved });
      } else {
        await fs.copyFile(resolved, outPath);
      }

      const artifactType = config.type;
      const name = entry.name ?? config.name;
      const parsedVersion = semver.parse(workspace.version);
      if (!parsedVersion) throw new Error(`Invalid semver version from workspace: ${workspace.version}`);
      const key = buildArtifactKey(artifactType, name, { type: 'release', version: parsedVersion, objectName: entry.objectName });

      files.push({
        name: outputBasename,
        metadata: {
          bucketName: entry.bucketName ?? config.bucketName,
          artifactType,
          name,
          key,
          region: entry.region,
        },
      });

      console.log(`[s3-artifact] Packing: ${entry.objectName} from ${resolved}`);
    }

    console.log(`[s3-artifact] Staged ${files.length} artifact(s) from ${workspace.cwd}/gitversion-s3.cjs`);
    return { files };
  }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean): Promise<void> {
    const basename = path.basename(fileName);

    const pluginData = packedPackage.pluginData?.['s3-artifact'] as Record<string, ArtifactMapEntry> | undefined;
    const mapEntry = pluginData?.[basename];

    if (mapEntry === undefined) {
      console.log(`[s3-artifact] ERROR: no routing found for ${basename} — was pack run first?`);
      return;
    }

    const { bucketName, key, region } = mapEntry;
    const uploader = new S3Uploader({ region });

    if (dryRun) {
      console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${bucketName}/${key}`);
      return;
    }

    console.log(`[s3-artifact] Uploading: s3://${bucketName}/${key}`);
    await uploader.upload(bucketName, key, fileName);
    console.log(`[s3-artifact] Upload complete: s3://${bucketName}/${key}`);

    const versionStr = packedPackage.version;
    const version = semver.parse(versionStr);
    if (!version) throw new Error(`Invalid semver version from packed package: ${versionStr}`);
    const { artifactType, name } = mapEntry;
    await uploader.writeVersionPointers(bucketName, artifactType, name, version);
  }
}

export { S3ArtifactPlugin };
export type { S3ArtifactEntry, S3WorkspaceConfig } from './utils/types';
