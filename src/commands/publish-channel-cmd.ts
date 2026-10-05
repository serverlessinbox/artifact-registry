import { Command, Option } from 'clipanion';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Uploader } from '../releases/uploader';
import type { ArtifactPackage } from '../artifacts/artifact';
import { selectArtifact } from '../artifacts/artifact-key';
import { loadWorkspaceConfig } from '../artifacts/workspace-config';
import { hasErrorCode } from '../utils/error-code';

/**
 * Uploads a workspace's artifacts to a mutable S3 channel path. Writes only the channel objects:
 * no version pointers and no release tracks.
 */
export class PublishChannelCommand extends Command {
  static override paths = [['publish', 'channel']];

  static override usage = Command.Usage({
    description: 'Publish artifacts to an S3 channel.',
    examples: [
      ['Publish all artifacts to the dev channel', '$0 publish channel'],
      ['Publish a single artifact to a named channel', '$0 publish channel --channel staging --object lambdas/admin-api.zip'],
    ],
  });

  cwd = Option.String('--cwd', {
    description: 'Directory containing artifact-registry.json. Defaults to process.cwd().',
  });

  channel = Option.String('--channel', 'dev', {
    description: 'S3 channel name.',
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
      config = await loadWorkspaceConfig(cwd);
    } catch (err: unknown) {
      if (hasErrorCode(err, 'ENOENT')) {
        this.context.stderr.write(`Error: artifact-registry.json not found in ${cwd}\n`);
        return 1;
      }
      throw err;
    }

    if (this.object) {
      const entry = selectArtifact(config, this.object);
      if (!entry) {
        this.context.stderr.write(`Error: no artifact with objectName '${this.object}' found\n`);
        return 1;
      }

      const pkg: ArtifactPackage = {
        bucketName: entry.bucketName ?? config.bucketName,
        artifactType: config.type,
        name: entry.name ?? config.name,
      };
      const filePath = path.isAbsolute(entry.source) ? entry.source : path.join(cwd, entry.source);
      const uploader = new S3Uploader(new S3Client({ region: entry.region }));
      this.context.stdout.write(`Uploading ${entry.objectName} to channel ${this.channel}...\n`);
      await uploader.uploadChannel(pkg, this.channel, entry.objectName, filePath);
    } else {
      if (config.artifacts.length === 0) {
        this.context.stderr.write(`Error: no artifacts found\n`);
        return 1;
      }

      for (const entry of config.artifacts) {
        const pkg: ArtifactPackage = {
          bucketName: entry.bucketName ?? config.bucketName,
          artifactType: config.type,
          name: entry.name ?? config.name,
        };
        const filePath = path.isAbsolute(entry.source) ? entry.source : path.join(cwd, entry.source);
        const uploader = new S3Uploader(new S3Client({ region: entry.region }));
        this.context.stdout.write(`Uploading ${entry.objectName} to channel ${this.channel}...\n`);
        await uploader.uploadChannel(pkg, this.channel, entry.objectName, filePath);
      }
    }

    this.context.stdout.write('Done.\n');
    return 0;
  }
}
