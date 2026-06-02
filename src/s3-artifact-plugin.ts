import * as fs from 'fs/promises';
import * as path from 'path';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage } from '@jwpkg/gitversion';
import { S3Uploader } from './uploader';

interface S3ArtifactPluginProps {
  bucketName: string;
  basePath: string;
  packageName: string;
  artifactsDir?: string;
  /**
   * Template for the S3 key. Supports: {basePath}, {version}, {packageName}, {filename}
   * Default: '{basePath}/v{version}/{packageName}/{filename}'
   */
  fileNameTemplate?: string;
}

class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  private readonly artifactsDir: string;
  private readonly fileNameTemplate: string;
  private readonly uploader: S3Uploader;

  constructor(private readonly props: S3ArtifactPluginProps) {
    this.artifactsDir = props.artifactsDir ?? 'dist/release';
    this.fileNameTemplate = props.fileNameTemplate ?? '{basePath}/v{version}/{packageName}/{filename}';
    this.uploader = new S3Uploader();
  }

  get packManager(): IPackManager {
    return this;
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<string[] | null> {
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
    const version = releaseTag.replace(/^v/, '');
    const basename = path.basename(fileName);

    const key = this.fileNameTemplate
      .replace('{basePath}', this.props.basePath)
      .replace('{version}', version)
      .replace('{packageName}', this.props.packageName)
      .replace('{filename}', basename);

    if (dryRun) {
      console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${this.props.bucketName}/${key}`);
      return;
    }

    console.log(`[s3-artifact] Uploading ${basename} → s3://${this.props.bucketName}/${key}`);
    await this.uploader.upload(this.props.bucketName, key, fileName);
    console.log(`[s3-artifact] Upload complete: s3://${this.props.bucketName}/${key}`);

    // Write version-alias pointer files
    const versionParts = version.split('.');
    const major = versionParts[0];
    const minor = versionParts[1] ?? '0';
    const publishedAt = new Date().toISOString();
    const pointer = { version, publishedAt };

    const pointerKeys = [
      `${this.props.basePath}/latest-stable.json`,
      `${this.props.basePath}/v${major}/latest-stable.json`,
      `${this.props.basePath}/v${major}.${minor}/latest-stable.json`,
    ];

    for (const pointerKey of pointerKeys) {
      console.log(`[s3-artifact] Writing pointer → s3://${this.props.bucketName}/${pointerKey}`);
      await this.uploader.uploadJson(this.props.bucketName, pointerKey, pointer);
    }
  }
}

export { S3ArtifactPlugin };
export type { S3ArtifactPluginProps };
