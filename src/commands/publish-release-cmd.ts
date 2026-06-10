import { Command, Option } from 'clipanion';
import * as path from 'path';
import { S3Uploader } from '../utils/uploader';
import { loadConfig, selectArtifact, buildReleaseKey } from '../utils/load-config';

export class PublishReleaseCommand extends Command {
  static override paths = [['publish', 'release']];

  static override usage = Command.Usage({
    description: 'Publish artifacts to a versioned S3 release path and update version pointers.',
    examples: [
      ['Publish release 1.2.3', '$0 publish release --version 1.2.3'],
      ['Publish a single artifact for release 1.2.3', '$0 publish release --version 1.2.3 --object lambdas/admin-api.zip'],
    ],
  });

  version = Option.String('--version', {
    required: true,
    description: 'Semver version, e.g. 1.2.3.',
  });

  cwd = Option.String('--cwd', {
    description: 'Directory containing gitversion-s3.cjs. Defaults to process.cwd().',
  });

  profile = Option.String('--profile', {
    description: 'AWS profile to use.',
  });

  object = Option.String('--object', {
    description: 'Publish only the artifact with this objectName.',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    const cwd = this.cwd ?? process.cwd();

    let config;
    try {
      config = loadConfig(cwd);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        this.context.stderr.write(`Error: gitversion-s3.cjs not found in ${cwd}\n`);
        return 1;
      }
      throw err;
    }

    const writtenPointers = new Set<string>();
    let lastUploader: S3Uploader | undefined;
    let lastBucketName: string | undefined;
    let lastBasePath: string | undefined;

    let artifacts = config.artifacts;
    if (this.object) {
      const entry = selectArtifact(config, this.object);
      if (!entry) {
        this.context.stderr.write(`Error: no artifact with objectName '${this.object}' found\n`);
        return 1;
      }
      artifacts = [entry];
    }

    for (const entry of artifacts) {
      const bucketName = entry.bucketName ?? config.bucketName;
      const basePath = entry.basePath ?? config.basePath;
      const filePath = path.isAbsolute(entry.source) ? entry.source : path.join(cwd, entry.source);
      const key = buildReleaseKey(basePath, this.version, entry.objectName);
      const uploader = new S3Uploader({ region: entry.region });
      this.context.stdout.write(`Uploading ${entry.objectName} to ${key}...\n`);
      await uploader.upload(bucketName, key, filePath);

      const comboKey = `${bucketName}::${basePath}`;
      if (!writtenPointers.has(comboKey)) {
        writtenPointers.add(comboKey);
        lastUploader = uploader;
        lastBucketName = bucketName;
        lastBasePath = basePath;
      }
    }

    for (const comboKey of writtenPointers) {
      const [bucketName, basePath] = comboKey.split('::');
      const uploader = (lastBucketName === bucketName && lastBasePath === basePath && lastUploader)
        ? lastUploader
        : new S3Uploader({});
      this.context.stdout.write(`Writing version pointers for ${bucketName}/${basePath}...\n`);
      await uploader.writeVersionPointers(bucketName, basePath, this.version!);
    }

    this.context.stdout.write('Done.\n');
    return 0;
  }
}
