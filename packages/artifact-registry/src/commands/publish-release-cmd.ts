import { Command, Option } from 'clipanion';
import semver from 'semver';
import { ArtifactSelectionError, toArtifactPackageMapKey } from '../artifacts/artifact';
import type { StagedFile } from '../artifacts/artifact';
import { withStagedArtifacts } from '../artifacts/stage-artifacts';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { RegionalPublisher, RegionPublishError } from '../releases/regional-publisher';
import type { ReleaseTrackCopy } from '../releases/release';
import { createUploaders } from './create-uploaders';

/**
 * Stages a workspace's artifacts and uploads them to the versioned release path in every region
 * bucket of each artifact, then writes the version pointers for each package and, for template
 * artifacts, the release-track copies. Pointers are written only after every object of every
 * package is in all of its buckets. Does not write channel objects.
 */
export class PublishReleaseCommand extends Command {
  static override paths = [['publish', 'release']];

  static override usage = Command.Usage({
    description: 'Stage the artifacts of artifact-registry.json and publish them to a versioned S3 release path in every region of each artifact, then update version pointers.',
    examples: [
      ['Publish release 1.2.3', '$0 publish release --version 1.2.3'],
      ['Publish a single artifact for release 1.2.3', '$0 publish release --version 1.2.3 --object lambdas/handler.zip'],
      ['Publish release 1.2.3 to one region only', '$0 publish release --version 1.2.3 --region eu-west-1'],
    ],
  });

  version = Option.String('--version', {
    required: true,
    description: 'Semver version, e.g. 1.2.3.',
  });

  cwd = Option.String('--cwd', {
    description: 'Directory containing artifact-registry.json. Defaults to process.cwd().',
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

    const version = semver.parse(this.version);
    if (!version) {
      this.context.stderr.write(`Error: invalid semver version "${this.version}"\n`);
      return 1;
    }

    try {
      await withStagedArtifacts({ cwd: this.cwd ?? process.cwd(), objectName: this.object, regions: this.regions }, async files => {
        for (const file of files) {
          const { artifactType, name, project } = file.routing.package;
          const key = buildArtifactKey(artifactType, name, { type: 'release', version, objectName: file.routing.objectName, project });
          for (const target of file.routing.targets) {
            this.context.stdout.write(`Uploading ${file.routing.objectName} to ${target.bucketName}/${key}...\n`);
          }
        }
        await new RegionalPublisher(createUploaders(files)).uploadRelease({ version, packages: groupByPackage(files) });
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

function groupByPackage(files: StagedFile[]): ReleaseTrackCopy[] {
  const packages = new Map<string, ReleaseTrackCopy>();
  for (const file of files) {
    const packageKey = toArtifactPackageMapKey(file.routing.package);
    let copy = packages.get(packageKey);
    if (copy === undefined) {
      copy = { package: file.routing.package, targets: file.routing.targets, entries: [] };
      packages.set(packageKey, copy);
    }
    copy.entries.push({ objectName: file.routing.objectName, filePath: file.filePath });
  }
  return [...packages.values()];
}
