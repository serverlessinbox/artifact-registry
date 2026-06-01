import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { IPackManager, IPlugin, PackedPackage, IWorkspace } from '@jwpkg/gitversion';
import { createReadStream, readdirSync, copyFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

interface S3ArtifactPluginProps {
  bucketName: string;
  basePath: string;
  packageName: string;         // e.g. 'lambdas', 'webmail', 'admin'
  artifactsDir?: string;       // default: 'dist/release'
  fileNameTemplate?: string;   // default: '{basePath}/v{version}/{packageName}/{filename}'
}

export class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  get packManager(): IPackManager {
  get packManager(): IPackManager {
    return this;
  }

  private readonly artifactsDir: string;
  private readonly fileNameTemplate: string;

  constructor(private readonly props: S3ArtifactPluginProps) {
    this.artifactsDir = props.artifactsDir ?? 'dist/release';
  constructor(private readonly props: S3ArtifactPluginProps) {
    this.artifactsDir = props.artifactsDir ?? 'dist/release';
    this.fileNameTemplate = props.fileNameTemplate ?? '{basePath}/v{version}/{packageName}/{filename}';
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<string[] | null> {
    // Only operate on the root workspace
    if (workspace.relativeCwd !== '.') {
      return null;
    }

    if (!existsSync(this.artifactsDir)) {
      console.log(`[s3-artifact] WARNING: artifactsDir "${this.artifactsDir}" does not exist — nothing to stage`);
      return [];
    }

    console.log(`[s3-artifact] pack started: workspace="${workspace.manifest.name}", outputFolder="${outputFolder}"`);

    const zipFiles = readdirSync(this.artifactsDir).filter((f: string) => f.endsWith('.zip'));
    console.log(`[s3-artifact] found ${zipFiles.length} .zip files in ${this.artifactsDir}`);

    if (zipFiles.length === 0) {
      console.warn(`[s3-artifact] WARNING: no .zip files found in ${this.artifactsDir}`);
    }

    const staged: string[] = [];
    for (const file of zipFiles) {
      const src = join(this.artifactsDir, file);
      const dest = join(outputFolder, file);
      copyFileSync(src, dest);
      staged.push(file);
      console.log(`[s3-artifact] staged: ${file}`);
    }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean, _module?: string): Promise<void> {
    const key = this.fileNameTemplate
      .replace('{basePath}', this.props.basePath)
      .replace('{version}', releaseTag.replace(/^v/, ''))
      .replace('{packageName}', this.props.packageName)
      .replace('{filename}', basename(fileName));

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean, _module?: string): Promise<void> {

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
