import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { IPackManager, IPlugin } from '@jwpkg/gitversion';
import { PackedPackage } from '@jwpkg/gitversion/src/core/pack-artifact';
import { IWorkspace } from '@jwpkg/gitversion/src/core/workspace-utils';
import { createReadStream, readdirSync, copyFileSync } from 'fs';
import { join, basename } from 'path';

export interface S3ArtifactPluginProps {
  bucketName: string;
  basePath: string;
  artifactsDir?: string;       // default: 'dist/release'
  fileNameTemplate?: string;   // default: '{basePath}/v{version}/lambdas/{filename}'
}

export class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  get packManager(): IPackManager {
    return this;
  }

  private readonly artifactsDir: string;
  private readonly fileNameTemplate: string;

  constructor(private readonly props: S3ArtifactPluginProps) {
    this.artifactsDir = props.artifactsDir ?? 'dist/release';
    this.fileNameTemplate = props.fileNameTemplate ?? '{basePath}/v{version}/lambdas/{filename}';
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<string[] | null> {
    // Only operate on the root workspace
    if (workspace.relativeCwd !== '.') {
      return null;
    }

    const zipFiles = readdirSync(this.artifactsDir).filter(f => f.endsWith('.zip'));

    const staged: string[] = [];
    for (const file of zipFiles) {
      const src = join(this.artifactsDir, file);
      const dest = join(outputFolder, file);
      copyFileSync(src, dest);
      staged.push(file);
      console.log(`[s3-artifact] staged: ${file}`);
    }

    return staged;
  }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean, _module?: string): Promise<void> {
    const key = this.fileNameTemplate
      .replace('{basePath}', this.props.basePath)
      .replace('{version}', packedPackage.version)
      .replace('{filename}', basename(fileName));

    if (dryRun) {
      console.log(`[s3-artifact] dry-run: would upload s3://${this.props.bucketName}/${key}`);
      return;
    }

    console.log(`[s3-artifact] uploading s3://${this.props.bucketName}/${key}`);

    const client = new S3Client({});
    const body = createReadStream(fileName);

    await client.send(new PutObjectCommand({
      Bucket: this.props.bucketName,
      Key: key,
      Body: body,
    }));

    console.log(`[s3-artifact] uploaded s3://${this.props.bucketName}/${key}`);
  }
}
