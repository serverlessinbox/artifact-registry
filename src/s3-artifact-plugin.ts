import * as fs from 'fs/promises';
import * as path from 'path';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage } from '@jwpkg/gitversion';
import { S3Uploader } from './uploader';
import { buildArtifacts } from './build-artifacts';
import type { S3ArtifactEntry, S3WorkspaceConfig } from './build-artifacts';

export type { S3ArtifactEntry, S3WorkspaceConfig };

interface S3ArtifactPluginProps {
  bucketName?: string;
  basePath?: string;
  packageName?: string;
  artifactsDir?: string;
  /**
   * Template for the S3 key. Supports: {basePath}, {version}, {packageName}, {filename}
   * Default: '{basePath}/v{version}/{packageName}/{filename}'
   */
  fileNameTemplate?: string;
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

  private readonly artifactsDir: string;
  private readonly fileNameTemplate: string;
  private readonly uploader: S3Uploader;
  private readonly artifactMap = new Map<string, ArtifactMapEntry>();

  constructor(private readonly props: S3ArtifactPluginProps = {}) {
    this.artifactsDir = props.artifactsDir ?? 'dist/release';
    this.fileNameTemplate = props.fileNameTemplate ?? '{basePath}/v{version}/{packageName}/{filename}';
    this.uploader = new S3Uploader();
  }

  get packManager(): IPackManager {
    return this;
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<string[] | null> {
    const result = await buildArtifacts(workspace.cwd, outputFolder);

    if (result.outputFiles.length > 0) {
      // Merge routing map into plugin's artifactMap
      for (const [key, value] of result.routingMap) {
        this.artifactMap.set(key, value);
      }
      console.log(`[s3-artifact] Staged ${result.outputFiles.length} artifact(s) from ${workspace.cwd}/artifacts.cjs`);
      return result.outputFiles;
    }

    // Backward-compat fallback: only run at root workspace
    if (workspace.relativeCwd !== '.') {
      return null;
    }

    const files = await fs.readdir(this.artifactsDir);
    const zips = files.filter(f => f.endsWith('.zip'));

    if (zips.length === 0) {
      console.log(`[s3-artifact] No zip files found in ${this.artifactsDir}`);
      return null;
    }

    const packed: string[] = [];
    for (const zip of zips) {
      const src = path.join(this.artifactsDir, zip);
      const dest = path.join(outputFolder, zip);
      await fs.copyFile(src, dest);
      packed.push(zip);
    }

    console.log(`[s3-artifact] Staged ${packed.length} zip(s) for publish`);
    return packed;
  }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean): Promise<void> {
    const version = packedPackage.version;
    const basename = path.basename(fileName);

    const mapEntry = this.artifactMap.get(basename);

    if (mapEntry !== undefined) {
      // Per-workspace-config path
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
    } else {
      // Backward-compat path
      const key = this.fileNameTemplate
        .replace('{basePath}', this.props.basePath ?? '')
        .replace('{version}', version)
        .replace('{packageName}', this.props.packageName ?? '')
        .replace('{filename}', basename);

      if (dryRun) {
        console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${this.props.bucketName}/${key}`);
        return;
      }

      console.log(`[s3-artifact] Uploading ${basename} → s3://${this.props.bucketName}/${key}`);
      await this.uploader.upload(this.props.bucketName ?? '', key, fileName);
      console.log(`[s3-artifact] Upload complete: s3://${this.props.bucketName}/${key}`);

      // Write version-alias pointer files only for real semver releases
      await this.uploader.writeVersionPointers(this.props.bucketName ?? '', this.props.basePath ?? '', packedPackage.version);
    }
  }
}

export { S3ArtifactPlugin };
export type { S3ArtifactPluginProps };
