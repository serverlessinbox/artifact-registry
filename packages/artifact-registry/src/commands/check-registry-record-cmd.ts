import { Command, Option } from 'clipanion';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { loadRegistryRecord } from '../artifacts/load-registry-record';
import { parseRegistryRecord } from '../registry';
import { compareRegistryRecords } from '../registry/compare-registry-records';

/**
 * Checks if the registry record in a file matches the live record in S3.
 */
export class CheckRegistryRecordCommand extends Command {
  static override paths = [['registry-record', 'check']];

  static override usage = Command.Usage({
    description: 'Check if a local registry record file matches the live record in S3.',
    details: `
      Reads the registry record from the given file, then reads the live record from the bucket of the
      region given by \`--region\`, and compares the two. Regions are compared as sets and bucket
      overrides as maps, so ordering never counts as a difference.

      The positional argument \`record-file\` is the path to the registry record JSON file (required,
      taken once); a relative path is resolved against the current directory.

      The option \`--region\` is the region whose bucket holds the live record (required, given once).

      Exit code 0: the records are equal. Exit code 1: any difference, or the file or the live record
      cannot be read or parsed.
    `,
    examples: [
      [
        'Check if a local file matches the live record',
        '$0 registry-record check registry-record.json --region eu-west-1',
      ],
    ],
  });

  recordFile = Option.String({
    name: 'record-file',
    required: true,
  });

  region = Option.String('--region', {
    required: true,
    description: 'The region whose bucket holds the live record (required, given once).',
  });

  async execute(): Promise<number> {
    try {
      const filePath = path.isAbsolute(this.recordFile)
        ? this.recordFile
        : path.join(process.cwd(), this.recordFile);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileRecord = parseRegistryRecord(fileContent, `file ${filePath}`);

      const client = new S3Client({ region: this.region, followRegionRedirects: true });
      const liveRecord = await loadRegistryRecord(client, fileRecord, this.region);

      const differences = compareRegistryRecords(fileRecord, liveRecord);

      if (differences.length > 0) {
        this.context.stdout.write(`Registry record mismatch:\n`);
        for (const diff of differences) {
          this.context.stdout.write(`  ${diff.field}: file=${JSON.stringify(diff.fileValue)}, live=${JSON.stringify(diff.liveValue)}\n`);
        }
        return 1;
      }

      this.context.stdout.write(`Registry record matches live record.\n`);
      return 0;
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.context.stderr.write(`Error: ${err.message}\n`);
      } else {
        this.context.stderr.write(`Error: unknown error\n`);
      }
      return 1;
    }
  }
}
