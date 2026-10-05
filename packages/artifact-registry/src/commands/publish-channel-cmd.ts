import { Command, Option } from 'clipanion';
import { RegionalPublisher, RegionPublishError } from '../releases';
import { ArtifactSelectionError } from '../artifacts/artifact';
import { withStagedArtifacts } from '../artifacts/stage-artifacts';
import { createUploaders } from './create-uploaders';

/**
 * Stages a workspace's artifacts and uploads them to a mutable S3 channel path in every region
 * bucket of each artifact. Writes only the channel objects: no version pointers and no release tracks.
 */
export class PublishChannelCommand extends Command {
  static override paths = [['publish', 'channel']];

  static override usage = Command.Usage({
    description: 'Stage the artifacts of artifact-registry.json and publish them to an S3 channel in every region of each artifact.',
    examples: [
      ['Publish all artifacts to the dev channel', '$0 publish channel'],
      ['Publish a single artifact to a named channel', '$0 publish channel --channel staging --object lambdas/handler.zip'],
      ['Publish to one region only', '$0 publish channel --region eu-west-1'],
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

  regions = Option.Array('--region', [], {
    description: 'Restrict publishing to this region. Repeatable. Every region given must be a target of a selected artifact. Defaults to all targets of each artifact.',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    try {
      await withStagedArtifacts({ cwd: this.cwd ?? process.cwd(), objectName: this.object, regions: this.regions }, async files => {
        const publisher = new RegionalPublisher(createUploaders(files));
        for (const file of files) {
          for (const target of file.routing.targets) {
            this.context.stdout.write(`Uploading ${file.routing.objectName} to channel ${this.channel} in ${target.bucketName}...\n`);
          }
          await publisher.uploadChannel(file.routing, this.channel, file.filePath);
        }
      });
    } catch (err: unknown) {
      if (err instanceof ArtifactSelectionError || err instanceof RegionPublishError) {
        this.context.stderr.write(`Error: ${err.message}\n`);
        return 1;
      }
      throw err;
    }

    this.context.stdout.write('Done.\n');
    return 0;
  }
}
