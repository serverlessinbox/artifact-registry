import { Command, Option } from 'clipanion';
import * as path from 'path';
import semver from 'semver';
import { S3Client } from '@aws-sdk/client-s3';
import { toArtifactPackageMapKey } from '../artifacts/artifact';
import type { ArtifactPackage } from '../artifacts/artifact';
import { S3Uploader } from '../releases/uploader';
import type { PackageRelease, ReleaseTrackCopy } from '../releases/release';
import { selectArtifact, buildArtifactKey } from '../artifacts/artifact-key';
import { loadWorkspaceConfig } from '../artifacts/workspace-config';
import { hasErrorCode } from '../utils/error-code';

const DEFAULT_REGION_KEY = '';

/**
 * Uploads a workspace's artifacts to the versioned release path, then writes the version pointers
 * for each bucket/type/name and, for template artifacts, the release-track copies. Does not write
 * channel objects.
 */
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

    const version = semver.parse(this.version);
    if (!version) {
      this.context.stderr.write(`Error: invalid semver version "${this.version}"\n`);
      return 1;
    }

    const cwd = this.cwd ?? process.cwd();

    let config;
    try {
      config = loadWorkspaceConfig(cwd);
    } catch (err: unknown) {
      if (hasErrorCode(err, 'MODULE_NOT_FOUND')) {
        this.context.stderr.write(`Error: gitversion-s3.cjs not found in ${cwd}\n`);
        return 1;
      }
      throw err;
    }

    const uploaders = new Map<string, S3Uploader>();

    // Per comboKey (bucket, type, name): the pointer to write, with every published objectName for
    // its `objects[]`, for all artifact types.
    const releases = new Map<string, PackageRelease>();

    // Tracks artifact entries per comboKey for release-track writes (template type only).
    const trackCopies = new Map<string, ReleaseTrackCopy>();

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
      const pkg: ArtifactPackage = {
        bucketName: entry.bucketName ?? config.bucketName,
        artifactType: config.type,
        name: entry.name ?? config.name,
      };
      const filePath = path.isAbsolute(entry.source) ? entry.source : path.join(cwd, entry.source);
      const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version, objectName: entry.objectName });
      this.context.stdout.write(`Uploading ${entry.objectName} to ${key}...\n`);
      await this.uploaderForRegion(uploaders, entry.region).upload(pkg.bucketName, key, filePath);

      const comboKey = toArtifactPackageMapKey(pkg);
      let release = releases.get(comboKey);
      if (release === undefined) {
        release = { package: pkg, region: entry.region, objects: [] };
        releases.set(comboKey, release);
      }

      release.objects.push({ name: entry.objectName });

      if (pkg.artifactType === 'template') {
        let trackCopy = trackCopies.get(comboKey);
        if (trackCopy === undefined) {
          trackCopy = { package: pkg, region: entry.region, entries: [] };
          trackCopies.set(comboKey, trackCopy);
        }
        trackCopy.entries.push({ objectName: entry.objectName, filePath });
      }
    }

    for (const release of releases.values()) {
      const pkg = release.package;
      this.context.stdout.write(`Writing version pointers for ${pkg.bucketName}/${pkg.artifactType}/${pkg.name}...\n`);
      await this.uploaderForRegion(uploaders, release.region).writeVersionPointers(release, version);
    }

    for (const trackCopy of trackCopies.values()) {
      const pkg = trackCopy.package;
      const uploader = this.uploaderForRegion(uploaders, trackCopy.region);
      if (version.prerelease.length > 0) {
        const prereleaseTag = String(version.prerelease[0]);
        this.context.stdout.write(`Writing release track '${prereleaseTag}' for ${pkg.bucketName}/${pkg.artifactType}/${pkg.name}...\n`);
        await uploader.uploadReleaseTrack(trackCopy, prereleaseTag);
      } else {
        const { major } = version;
        this.context.stdout.write(`Writing release tracks 'latest' and '${major}.x' for ${pkg.bucketName}/${pkg.artifactType}/${pkg.name}...\n`);
        await uploader.uploadReleaseTrack(trackCopy, 'latest');
        await uploader.uploadReleaseTrack(trackCopy, `${major}.x`);
      }
    }

    this.context.stdout.write('Done.\n');
    return 0;
  }

  private uploaderForRegion(uploaders: Map<string, S3Uploader>, region: string | undefined): S3Uploader {
    const regionKey = region ?? DEFAULT_REGION_KEY;
    let uploader = uploaders.get(regionKey);
    if (uploader === undefined) {
      uploader = new S3Uploader(new S3Client({ region }));
      uploaders.set(regionKey, uploader);
    }
    return uploader;
  }
}
