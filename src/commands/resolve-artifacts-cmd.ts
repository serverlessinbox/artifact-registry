import { Command, Option } from 'clipanion';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { loadReleasePointer } from '../releases/release-pointer';
import { isArtifactType } from '../artifacts/artifact';

/**
 * Reads the release pointer of each requested component from S3 and writes a flat
 * component → version JSON file to every `--output` path. Only reads pointers; it never publishes.
 */
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

    const client = new S3Client({ region: this.region, followRegionRedirects: true });
    const result: Record<string, string> = {};

    for (const component of this.components) {
      const parts = component.split(':');
      if (parts.length !== 3) {
        this.context.stderr.write(`Error: --component must be in the form key:type:name, got: ${component}\n`);
        return 1;
      }
      const [key, artifactType, name] = parts;
      if (!isArtifactType(artifactType)) {
        this.context.stderr.write(`Error: --component type must be 'package' or 'template', got: ${artifactType}\n`);
        return 1;
      }
      const s3Key = buildArtifactKey(artifactType, name, { type: 'release-pointer', track: this.track });

      this.context.stdout.write(`Resolving ${key} from s3://${this.bucket}/${s3Key} ... `);
      const pointer = await loadReleasePointer(client, this.bucket, s3Key);
      result[key] = pointer.version;
      this.context.stdout.write(`${pointer.version}\n`);
    }

    const json = JSON.stringify(result, null, 2) + '\n';
    for (const output of this.outputs) {
      const outPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
      await fs.writeFile(outPath, json);
      this.context.stdout.write(`Written: ${outPath}\n`);
    }

    return 0;
  }
}
