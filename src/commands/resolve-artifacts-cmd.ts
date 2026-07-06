import { Command, Option } from 'clipanion';
import * as fs from 'fs';
import * as path from 'path';
import { S3Uploader } from '../utils/uploader';
import { buildArtifactKey } from '../utils/artifact-key';
import type { ArtifactType } from '../utils/types';

export class ResolveArtifactsCommand extends Command {
  static override paths = [['resolve-artifacts']];

  static override usage = Command.Usage({
    description: 'Resolve component artifact versions from S3 release pointers and write artifact-versions.json. Pointers can be track-scoped (--track) or global (no --track).',
    examples: [
      [
        'Resolve three components from the global latest-stable pointer',
        '$0 resolve-artifacts --bucket mailbox-artifacts-eu-west-1 --region eu-west-1 --component mailbox-go:package:mailbox-go --component mailbox-admin-ui:package:mailbox-admin-ui --output artifact-versions.json --output packages/mailbox/artifact-versions.json',
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

  components = Option.Array('--component', {
    required: true,
    description: 'Component in the form key:type:name (e.g. mailbox-go:package:mailbox-go). Repeatable.',
  });

  track = Option.String('--track', {
    description: 'Release track to resolve, e.g. v1 or v1.2. When omitted, resolves the global untracked latest-stable pointer.',
  });

  outputs = Option.Array('--output', {
    required: true,
    description: 'Output file path. Repeatable (writes to every path given).',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    const uploader = new S3Uploader({ region: this.region });
    const result: Record<string, string> = {};

    for (const component of this.components) {
      const parts = component.split(':');
      if (parts.length !== 3) {
        this.context.stderr.write(`Error: --component must be in the form key:type:name, got: ${component}\n`);
        return 1;
      }
      const [key, artifactType, name] = parts as [string, ArtifactType, string];
      const s3Key = buildArtifactKey(artifactType, name, { type: 'release-pointer', track: this.track });

      this.context.stdout.write(`Resolving ${key} from s3://${this.bucket}/${s3Key} ... `);
      const data = await uploader.readJson(this.bucket, s3Key) as { version?: string };
      if (!data.version) {
        this.context.stderr.write(`\nError: no .version in s3://${this.bucket}/${s3Key}\n`);
        return 1;
      }
      result[key] = data.version;
      this.context.stdout.write(`${data.version}\n`);
    }

    const json = JSON.stringify(result, null, 2) + '\n';
    for (const output of this.outputs) {
      const outPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
      fs.writeFileSync(outPath, json);
      this.context.stdout.write(`Written: ${outPath}\n`);
    }

    return 0;
  }
}
