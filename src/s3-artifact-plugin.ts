import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage } from '@jwpkg/gitversion';
import { S3Uploader } from './uploader';
import { run } from './utils/common';

export interface S3ArtifactEntry {
  /** Path to source file or directory. Absolute or relative to workspace.cwd. */
  source: string;
  /** S3 object name for the output (e.g. 'lambdas/edge-deployer.zip', 'template.json'). */
  objectName: string;
  /** Overrides workspace-level bucketName for this artifact. */
  bucketName?: string;
  /** Overrides workspace-level basePath for this artifact. */
  basePath?: string;
  /** AWS region for the S3 client used to upload this artifact. Defaults to SDK default. */
  region?: string;
}

export interface S3WorkspaceConfig {
  /** Default S3 bucket for all artifacts in this workspace. */
  bucketName: string;
  /** Default S3 base path (e.g. 'packages/mailbox-cdk'). */
  basePath: string;
  /** Artifacts to stage and publish. */
  artifacts: S3ArtifactEntry[];
}

interface ArtifactMapEntry {
  bucketName: string;
  basePath: string;
  region?: string;
  objectName: string;
}

class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  private readonly uploader: S3Uploader;
  private readonly artifactMap = new Map<string, ArtifactMapEntry>();

  constructor() {
    this.uploader = new S3Uploader();
  }

  get packManager(): IPackManager {
    return this;
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<string[] | null> {
    let config: S3WorkspaceConfig | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require(path.join(workspace.cwd, 'gitversion-s3.cjs')) as S3WorkspaceConfig;
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

    const outputFiles: string[] = [];

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

      this.artifactMap.set(outputBasename, {
        bucketName: entry.bucketName ?? config.bucketName,
        basePath: entry.basePath ?? config.basePath,
        region: entry.region,
        objectName: entry.objectName,
      });

      outputFiles.push(outputBasename);
    }

    console.log(`[s3-artifact] Staged ${outputFiles.length} artifact(s) from ${workspace.cwd}/gitversion-s3.cjs`);
    return outputFiles;
  }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean): Promise<void> {
    const version = packedPackage.version;
    const basename = path.basename(fileName);

    const mapEntry = this.artifactMap.get(basename);
    if (mapEntry === undefined) {
      return;
    }

    const { bucketName, basePath, region, objectName } = mapEntry;
    const key = `${basePath}/v${version}/${objectName}`;
    const uploader = new S3Uploader({ region });

    if (dryRun) {
      console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${bucketName}/${key}`);
      return;
    }

    console.log(`[s3-artifact] Uploading ${basename} → s3://${bucketName}/${key}`);
    await uploader.upload(bucketName, key, fileName);
    console.log(`[s3-artifact] Upload complete: s3://${bucketName}/${key}`);

    await uploader.writeVersionPointers(bucketName, basePath, version);
  }
}

export { S3ArtifactPlugin };
