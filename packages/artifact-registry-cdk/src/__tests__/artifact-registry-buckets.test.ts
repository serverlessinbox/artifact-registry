import { parseRegistryRecord } from '@serverlessinbox/artifact-registry/registry';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ArtifactRegistryBuckets,
  type ArtifactRegistryConfig,
  type ArtifactWriter,
} from '../artifact-registry-buckets';

/**
 * Pins the CloudFormation that `ArtifactRegistryBuckets` synthesizes into a customer's template: the
 * StackSet that is adopted by its logical ID, the regions and bucket-name overrides it deploys, and
 * the one record write that tells every reader where the buckets are. A StackSet whose logical ID
 * changes is replaced on deploy, and a record that disagrees with the buckets sends readers to
 * buckets that do not exist, so loosening these assertions re-opens both failures.
 */

interface SynthesisOptions {
  readonly constructId?: string;
  readonly stackRegion?: string;
  readonly registry?: Partial<ArtifactRegistryConfig>;
  readonly channelHistoryRetention?: Duration;
}

/** The single S3 `putObject` call the record writer makes, with the account token resolved. */
interface RecordWrite {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  readonly body: string;
  readonly unresolvedCall: unknown;
}

const ADOPTED_CONSTRUCT_ID = 'PublicationAssetsBucketStackSet';
const STACK_ACCOUNT_ID = '123456789012';
const DEFAULT_STACK_REGION = 'eu-west-1';
const STACK_SET_NAME = 'acme-artifact-buckets';

const BASE_REGISTRY: ArtifactRegistryConfig = {
  bucketBase: 'acme-artifacts',
  project: 'acme',
  regions: ['us-east-1'],
};

const WRITERS: ArtifactWriter[] = [
  { principalArn: 'arn:aws:iam::111111111111:root' },
  { principalArn: 'arn:aws:iam::222222222222:role/publisher' },
];

const MEMBER_TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'artifact-bucket.yaml');

function synthesize(options: SynthesisOptions = {}): Template {
  const stack = new Stack(new App(), 'RegistryStack', {
    env: { account: STACK_ACCOUNT_ID, region: options.stackRegion ?? DEFAULT_STACK_REGION },
  });
  new ArtifactRegistryBuckets(stack, options.constructId ?? ADOPTED_CONSTRUCT_ID, {
    registry: { ...BASE_REGISTRY, ...options.registry },
    writers: WRITERS,
    channelHistoryRetention: options.channelHistoryRetention,
    stackSetName: STACK_SET_NAME,
    stackSetAdministrationRole: iam.Role.fromRoleArn(stack, 'AdminRole', 'arn:aws:iam::123456789012:role/stackset-admin'),
    stackSetExecutionRole: iam.Role.fromRoleArn(stack, 'ExecutionRole', 'arn:aws:iam::123456789012:role/stackset-exec'),
  });
  return Template.fromStack(stack);
}

function readMemberTemplate(): string {
  return fs.readFileSync(MEMBER_TEMPLATE_PATH, 'utf8');
}

function resolveToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    if ('Ref' in value && value.Ref === 'AWS::AccountId') {
      return STACK_ACCOUNT_ID;
    }
    if ('Fn::Join' in value && Array.isArray(value['Fn::Join'])) {
      const join: unknown[] = value['Fn::Join'];
      const delimiter = join[0];
      const parts = join[1];
      if (typeof delimiter === 'string' && Array.isArray(parts)) {
        return parts.map(part => resolveToString(part)).join(delimiter);
      }
    }
  }
  throw new Error(`cannot resolve template value ${JSON.stringify(value)}`);
}

function readRecordWrite(template: Template): RecordWrite {
  const createCapture = new Capture();
  template.hasResourceProperties('Custom::AWS', { Create: createCapture });
  const unresolvedCall: unknown = createCapture.asObject();

  const bucket = new Capture();
  const key = new Capture();
  const contentType = new Capture();
  const body = new Capture();
  const result = Match.serializedJson(
    Match.objectLike({
      service: 'S3',
      action: 'putObject',
      parameters: Match.objectLike({ Bucket: bucket, Key: key, ContentType: contentType, Body: body }),
    })
  ).test(resolveToString(unresolvedCall)).finished();
  if (result.hasFailed()) {
    throw new Error(result.toHumanStrings().join('\n'));
  }

  return {
    bucket: bucket.asString(),
    key: key.asString(),
    contentType: contentType.asString(),
    body: body.asString(),
    unresolvedCall,
  };
}

describe('ArtifactRegistryBuckets', () => {
  describe('StackSet adoption', () => {
    const template = synthesize();

    it('keeps the construct id as the StackSet logical ID', () => {
      expect(Object.keys(template.findResources('AWS::CloudFormation::StackSet'))).toEqual([ADOPTED_CONSTRUCT_ID]);
    });

    it('declares the self-managed StackSet with its name and parameters', () => {
      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackSetName: STACK_SET_NAME,
        PermissionModel: 'SELF_MANAGED',
        Parameters: [
          { ParameterKey: 'BaseName', ParameterValue: 'acme-artifacts' },
          {
            ParameterKey: 'WriterArns',
            ParameterValue: 'arn:aws:iam::111111111111:root,arn:aws:iam::222222222222:role/publisher',
          },
          { ParameterKey: 'NoncurrentVersionRetentionDays', ParameterValue: '1' },
        ],
      });
    });
  });

  describe('regions', () => {
    it('deploys the stack region first, then the listed regions, in one group', () => {
      synthesize({ registry: { regions: ['us-east-1'] } }).hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [{ Regions: ['eu-west-1', 'us-east-1'] }],
      });
    });

    it('deploys only the stack region when no region is listed', () => {
      synthesize({ registry: { regions: [] } }).hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [{ Regions: ['eu-west-1'] }],
      });
    });

    it('drops the stack region from the list and keeps it first', () => {
      synthesize({ registry: { regions: ['us-east-1', 'eu-west-1'] } }).hasResourceProperties(
        'AWS::CloudFormation::StackSet',
        { StackInstancesGroup: [{ Regions: ['eu-west-1', 'us-east-1'] }] }
      );
    });
  });

  describe('bucket name overrides', () => {
    it('gives only the overridden region its own group with the override parameter', () => {
      const template = synthesize({
        registry: { regions: ['us-east-1', 'eu-central-1'], bucketOverrides: { 'us-east-1': 'custom-use1' } },
      });

      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [
          { Regions: ['eu-west-1', 'eu-central-1'], ParameterOverrides: Match.absent() },
          {
            Regions: ['us-east-1'],
            ParameterOverrides: [{ ParameterKey: 'BucketNameOverride', ParameterValue: 'custom-use1' }],
          },
        ],
      });
    });
  });

  describe('record writer', () => {
    it('creates exactly one custom resource that depends on the StackSet', () => {
      const template = synthesize();

      template.resourceCountIs('Custom::AWS', 1);
      template.hasResource('Custom::AWS', { DependsOn: Match.arrayWith([ADOPTED_CONSTRUCT_ID]) });
    });

    it('writes the record to the convention bucket of the stack region', () => {
      const write = readRecordWrite(synthesize());

      expect(write).toMatchObject({
        bucket: 'acme-artifacts-eu-west-1',
        key: 'acme/registry.json',
        contentType: 'application/json',
      });
    });

    it('writes the record to the override bucket of the stack region', () => {
      const write = readRecordWrite(synthesize({ registry: { bucketOverrides: { 'eu-west-1': 'custom-euw1' } } }));

      expect(write.bucket).toBe('custom-euw1');
    });

    it('waits up to 300 seconds for the write', () => {
      synthesize().hasResourceProperties('Custom::AWS', { ServiceTimeout: '300' });
    });

    it('grants s3:PutObject on exactly the record object', () => {
      synthesize().hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 's3:PutObject',
              Effect: 'Allow',
              Resource: {
                'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':s3:::acme-artifacts-eu-west-1/acme/registry.json']],
              },
            },
          ],
        },
      });
    });

    it('grants the override bucket when the stack region is overridden', () => {
      synthesize({ registry: { bucketOverrides: { 'eu-west-1': 'custom-euw1' } } }).hasResourceProperties(
        'AWS::IAM::Policy',
        {
          PolicyDocument: {
            Statement: [
              {
                Action: 's3:PutObject',
                Resource: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':s3:::custom-euw1/acme/registry.json']] },
              },
            ],
          },
        }
      );
    });

    it('writes a record that parses and carries the full configuration', () => {
      const overrides = { 'us-east-1': 'custom-use1' };
      const write = readRecordWrite(
        synthesize({ registry: { regions: ['us-east-1', 'eu-central-1'], bucketOverrides: overrides } })
      );

      expect(parseRegistryRecord(write.body, 'record-writer')).toEqual({
        schemaVersion: 1,
        bucketBase: 'acme-artifacts',
        project: 'acme',
        regions: ['eu-west-1', 'us-east-1', 'eu-central-1'],
        bucketOverrides: overrides,
        ownerAccountId: STACK_ACCOUNT_ID,
      });
    });

    it('takes the owner account from the stack parameter, never as a literal', () => {
      const write = readRecordWrite(synthesize());
      const serializedCall = JSON.stringify(write.unresolvedCall);

      expect(serializedCall).toContain('{"Ref":"AWS::AccountId"}');
      expect(serializedCall).not.toContain(STACK_ACCOUNT_ID);
    });
  });

  describe('channel history retention', () => {
    it('passes a whole number of days to the StackSet', () => {
      synthesize({ channelHistoryRetention: Duration.days(3) }).hasResourceProperties('AWS::CloudFormation::StackSet', {
        Parameters: Match.arrayWith([{ ParameterKey: 'NoncurrentVersionRetentionDays', ParameterValue: '3' }]),
      });
    });

    it('fails synthesis for a fractional number of days', () => {
      expect(() => synthesize({ channelHistoryRetention: Duration.hours(36) })).toThrow(
        /cannot be converted into a whole number of days/
      );
    });
  });

  describe('member template', () => {
    it('declares BucketNameOverride and names the bucket from it through the condition', () => {
      const memberTemplate = readMemberTemplate();

      expect(memberTemplate).toMatch(/^ {2}BucketNameOverride:\n {4}Type: String\n {4}Default: ''$/m);
      expect(memberTemplate).toMatch(/^ {2}HasBucketNameOverride: !Not \[!Equals \[!Ref BucketNameOverride, ''\]\]$/m);
      expect(memberTemplate).toMatch(/^ {6}BucketName: !If \[HasBucketNameOverride, !Ref BucketNameOverride, /m);
    });
  });
});
