import { Command, Option } from 'clipanion';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { loadRegistryRecord, parseRegistryRecord, compareRegistryRecords } from '../artifacts/registry-record';
import type { RegistryLocation } from '../artifacts/registry-location';

/**
 * Checks if the registry record in a file matches the live record in S3.
 */
export class CheckRegistryRecordCommand extends Command {
  static override paths = [['registry-record', 'check']];

  static override usage = Command.Usage({
    description: 'Check if a local registry record file matches the live record in S3.',
    examples: [
      [
        'Check if a local file matches the live record',
        '$0 registry-record check registry-record.json',
      ],
    ],
  });

  recordFile = Option.String({
    required: true,
  });

  async execute(): Promise<number> {
    try {
      const filePath = path.isAbsolute(this.recordFile)
        ? this.recordFile
        : path.join(process.cwd(), this.recordFile);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileRecord = parseRegistryRecord(fileContent, `file ${filePath}`);

      const firstRegion = fileRecord.regions[0];
      const client = new S3Client({ region: firstRegion, followRegionRedirects: true });
      const liveRecord = await loadRegistryRecord(client, fileRecord, firstRegion);

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
