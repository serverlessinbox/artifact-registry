import { Command, Option } from 'clipanion';
import * as fs from 'fs';
import * as path from 'path';
import { S3Uploader } from '../utils/uploader';
import { buildReleaseKey } from '../utils/load-config';

export class PublishManifestCommand extends Command {
  static override paths = [['publish', 'manifest']];

  static override usage = Command.Usage({
    description: 'Build and publish a release manifest JSON to S3.',
    examples: [
      [
        'Publish manifest for CDK release 1.2.3',
        '$0 publish manifest --bucket mailbox-artifacts-eu-west-1 --region eu-west-1 --base-path packages/mailbox-cdk --version 1.2.3 --versions-file artifact-versions.json --extra-component mailbox-cdk-edge:{version}',
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

  basePath = Option.String('--base-path', {
    required: true,
    description: 'S3 base path for the manifest (e.g. packages/mailbox-cdk).',
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
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
      version = pkg.version;
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
    const artifactVersions: Record<string, string> = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));

    const components: Record<string, string> = { ...artifactVersions };
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

    const key = buildReleaseKey(this.basePath, version, 'manifest.json');
    const uploader = new S3Uploader({ region: this.region });

    this.context.stdout.write(`Publishing manifest to s3://${this.bucket}/${key}\n`);
    this.context.stdout.write(JSON.stringify(manifest, null, 2) + '\n');

    await uploader.uploadJson(this.bucket, key, manifest);

    this.context.stdout.write('Manifest published.\n');
    return 0;
  }
}
