import { Command, Option } from 'clipanion';
import * as path from 'path';
import semver from 'semver';
import { S3Client } from '@aws-sdk/client-s3';
import { isArtifactType } from '../artifacts/artifact';
import { readComponentVersions } from '../releases/component-versions';
import { readPackageJson } from '../utils/package-json';
import { S3Uploader } from '../releases/uploader';
import { buildArtifactKey } from '../artifacts/artifact-key';

/**
 * Builds a release manifest (version, publish time and a component → version map) and uploads it as
 * `manifest.json` under the release path of the named artifact. Uploads the manifest only, not the
 * artifacts themselves.
 */
export class PublishManifestCommand extends Command {
  static override paths = [['publish', 'manifest']];

  static override usage = Command.Usage({
    description: 'Build and publish a release manifest JSON to S3.',
    examples: [
      [
        'Publish manifest for CDK release 1.2.3',
        '$0 publish manifest --bucket mailbox-artifacts-eu-west-1 --region eu-west-1 --type package --name mailbox-cdk --version 1.2.3 --versions-file artifact-versions.json --extra-component mailbox-cdk-edge:{version}',
      ],
    ],
  });

  bucket = Option.String('--bucket', {
    required: true,
    description: 'S3 bucket name.',
  });

  region = Option.String('--region', {
    description: 'AWS region for the S3 client.',
  });

  profile = Option.String('--profile', {
    description: 'AWS profile to use.',
  });

  artifactType = Option.String('--type', {
    required: true,
    validator: isArtifactType,
    description: 'Artifact type (e.g. package, template).',
  });

  name = Option.String('--name', {
    required: true,
    description: 'Artifact name (e.g. mailbox-cdk).',
  });

  version = Option.String('--version', {
    description: 'Release version (semver, e.g. 1.2.3). Required if --version-from-package is not given.',
  });

  versionFromPackage = Option.String('--version-from-package', {
    description: 'Path to a package.json to read the version from. Used when --version is not provided.',
  });

  versionsFile = Option.String('--versions-file', {
    required: true,
    description: 'Path to artifact-versions.json (flat Record<string,string>). Resolved relative to cwd.',
  });

  extraComponents = Option.Array('--extra-component', [], {
    description: 'Extra component in the form name:{version} or name:x.y.z. {version} is substituted with --version. Repeatable.',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    let version = this.version;
    if (!version && this.versionFromPackage) {
      const pkgPath = path.isAbsolute(this.versionFromPackage)
        ? this.versionFromPackage
        : path.join(process.cwd(), this.versionFromPackage);
      const packageJson = readPackageJson(pkgPath);
      version = packageJson.version;
    }

    if (!version) {
      this.context.stderr.write('Error: --version or --version-from-package is required.\n');
      return 1;
    }

    if (version === '0.0.0') {
      this.context.stderr.write(`Error: unexpected version "${version}". Was gitversion bump run?\n`);
      return 1;
    }

    const versionsPath = path.isAbsolute(this.versionsFile)
      ? this.versionsFile
      : path.join(process.cwd(), this.versionsFile);
    const componentVersions = readComponentVersions(versionsPath);

    const components: Record<string, string> = { ...componentVersions };
    for (const extra of this.extraComponents) {
      const colonIdx = extra.indexOf(':');
      if (colonIdx === -1) {
        this.context.stderr.write(`Error: --extra-component must be in the form name:value, got: ${extra}\n`);
        return 1;
      }
      const name = extra.slice(0, colonIdx);
      const rawValue = extra.slice(colonIdx + 1);
      components[name] = rawValue === '{version}' ? version : rawValue;
    }

    const manifest = {
      version,
      publishedAt: new Date().toISOString(),
      components,
    };

    const parsedVersion = semver.parse(version);
    if (!parsedVersion) throw new Error(`Invalid semver version: ${version}`);
    const key = buildArtifactKey(this.artifactType, this.name, { type: 'release', version: parsedVersion, objectName: 'manifest.json' });
    const uploader = new S3Uploader(new S3Client({ region: this.region }));

    this.context.stdout.write(`Publishing manifest to s3://${this.bucket}/${key}\n`);
    this.context.stdout.write(JSON.stringify(manifest, null, 2) + '\n');

    await uploader.uploadJson(this.bucket, key, manifest);

    this.context.stdout.write('Manifest published.\n');
    return 0;
  }
}
