import { Command, Option } from 'clipanion';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { loadRegistryRecord } from '../artifacts/registry-record';
import type { RegistryLocation } from '../artifacts/registry-location';
import { buildArtifactBucketName } from '../artifacts/artifact-target';
import { CommandInputError } from './command-input-error';
import { parseRegistryLocation } from './registry-location-flags';

/**
 * Fetches the registry record from a published S3 location and writes it as formatted JSON.
 */
export class FetchRegistryRecordCommand extends Command {
  static override paths = [['registry-record', 'fetch']];

  static override usage = Command.Usage({
    description: 'Fetch the registry record from S3 and write it as JSON.',
    examples: [
      [
        'Fetch the record from the default location',
        '$0 registry-record fetch --bucket-base example-artifacts --project example --region eu-west-1 --output registry-record.json',
      ],
    ],
  });

  bucketBase = Option.String('--bucket-base', {
    required: true,
    description: 'Bucket name prefix: the bucket of the region is {bucket-base}-{region} unless overridden.',
  });

  bucketOverrides = Option.Array('--bucket-override', [], {
    description: 'Bucket name for one region, in the form region=bucket, replacing {bucket-base}-{region}. Repeatable.',
  });

  project = Option.String('--project', {
    required: true,
    description: 'Project prefix that leads every object key.',
  });

  region = Option.String('--region', {
    required: true,
    description: 'Region whose bucket is read; also the region of the S3 client.',
  });

  output = Option.String('--output', {
    required: true,
    description: 'Output file path where the record JSON is written.',
  });

  async execute(): Promise<number> {
    let location: RegistryLocation;
    try {
      location = parseRegistryLocation(this.bucketBase, this.project, this.bucketOverrides);
    } catch (err: unknown) {
      if (err instanceof CommandInputError) {
        this.context.stderr.write(`Error: ${err.message}\n`);
        return 1;
      }
      throw err;
    }

    try {
      const client = new S3Client({ region: this.region, followRegionRedirects: true });
      const record = await loadRegistryRecord(client, location, this.region);

      const json = JSON.stringify(record, null, 2) + '\n';
      const outPath = path.isAbsolute(this.output) ? this.output : path.join(process.cwd(), this.output);
      await fs.writeFile(outPath, json);
      const bucket = buildArtifactBucketName(location, this.region);
      this.context.stdout.write(`Fetched registry record from s3://${bucket}/${location.project}/registry.json\n`);
      this.context.stdout.write(`Written: ${outPath}\n`);
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
