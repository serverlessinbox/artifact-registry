import { Command, Option } from 'clipanion';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

export class CheckArtifactsCommand extends Command {
  static override paths = [['check-artifacts']];

  static override usage = Command.Usage({
    description: 'Verify that all required component latest-stable.json pointers exist in S3.',
    details: `
      Guards a release pipeline by checking that each upstream component has published
      its latest-stable.json pointer to S3. Exits 1 with a descriptive error if any are missing.
    `,
    examples: [
      [
        'Check three components before a CDK release',
        '$0 check-artifacts --bucket mailbox-artifacts-eu-west-1 --region eu-west-1 ' +
          '--component packages/mailbox-go --component packages/mailbox-admin-ui --component packages/mailbox-webmail-ui',
      ],
    ],
  });

  bucket = Option.String('--bucket', {
    required: true,
    description: 'Default S3 bucket name to check.',
  });

  region = Option.String('--region', {
    required: true,
    description: 'AWS region for the S3 client.',
  });

  profile = Option.String('--profile', {
    description: 'AWS profile to use.',
  });

  components = Option.Array('--component', {
    required: true,
    description:
      'S3 base path of a required component (e.g. packages/mailbox-go). Repeatable. ' +
      'The command checks {basePath}/latest-stable.json in the default bucket.',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    const client = new S3Client({ region: this.region });
    const missing: string[] = [];

    for (const basePath of this.components) {
      const key = `${basePath}/latest-stable.json`;
      try {
        await client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
        this.context.stdout.write(`OK: s3://${this.bucket}/${key}\n`);
      } catch (err: any) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          missing.push(key);
          this.context.stderr.write(`MISSING: s3://${this.bucket}/${key}\n`);
        } else {
          throw err;
        }
      }
    }

    if (missing.length > 0) {
      this.context.stderr.write(
        `\nRelease blocked: ${missing.length} component artifact(s) missing from S3.\n`,
      );
      this.context.stderr.write(
        'Publish the following components before releasing:\n',
      );
      for (const k of missing) {
        this.context.stderr.write(`  s3://${this.bucket}/${k}\n`);
      }
      return 1;
    }

    this.context.stdout.write('\nAll component artifacts present — proceeding with release.\n');
    return 0;
  }
}
