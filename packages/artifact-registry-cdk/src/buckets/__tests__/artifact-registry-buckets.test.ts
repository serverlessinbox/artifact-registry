import { parseRegistryRecord } from '@serverlessinbox/artifact-registry/registry';
import { App, Duration, Stack } from 'aws-cdk-lib';
import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as t from 'typanion';
import {
  ArtifactRegistryBuckets,
  type ArtifactRegistryConfig,
  type ArtifactWriter,
  type ReadAllowlist,
} from '../artifact-registry-buckets';

/**
 * Pins the CloudFormation that `ArtifactRegistryBuckets` synthesizes into a customer's template: the
 * StackSet that is adopted by its logical ID, the instance groups that give the deployment region
 * (a `Ref AWS::Region`) and every additional region a bucket, the bucket-name overrides including the
 * deployment region's `Fn::If` chain, the rule that rejects a deployment region that is also listed,
 * and the one record write that tells every reader where the buckets are. The stack has no `env`, so
 * the deployment region is only known at deployment. A StackSet whose logical ID changes is replaced
 * on deploy, a record that disagrees with the buckets sends readers to buckets that do not exist, a
 * deployment region left out of the instances leaves the record with no bucket to be written to, and
 * a region or bucket name baked in at synthesis breaks every customer who deploys the template
 * elsewhere, so loosening these assertions re-opens those failures.
 *
 * The member template's bucket policy is pinned by evaluating the template the way CloudFormation
 * does for given parameter values: a bucket that lets non-writers list, or that is readable outside
 * the project prefix, that answers unauthenticated requests, or that stays open to every AWS principal
 * once an allowlist is set, exposes artifacts the owner meant to protect or lets anyone enumerate the
 * registry.
 */

interface SynthesisOptions {
  readonly env?: { readonly region: string };
  readonly registry?: Partial<ArtifactRegistryConfig>;
  readonly channelHistoryRetention?: Duration;
  readonly readAllowlist?: ReadAllowlist;
}

/** A parameter value of the member template: a string, or the list a CommaDelimitedList holds. */
type ParameterValue = string | string[];

/** The template sections the evaluation of a member template needs, with the parameter values to evaluate for. */
interface TemplateEvaluation {
  readonly parameters: { [name: string]: ParameterValue };
  readonly conditions: { [name: string]: unknown };
}

const isPolicyStatement = t.isPartial({
  Sid: t.isString(),
  Effect: t.isString(),
  Principal: t.isOneOf([t.isLiteral('*'), t.isObject({ AWS: t.isArray(t.isString()) })]),
  Action: t.isOneOf([t.isString(), t.isArray(t.isString())]),
  Resource: t.isOneOf([t.isString(), t.isArray(t.isString())]),
  Condition: t.isOptional(t.isRecord(t.isRecord(t.isOneOf([t.isBoolean(), t.isString()])))),
});

/** A statement of the member template's bucket policy after CloudFormation evaluated it. */
type PolicyStatement = t.InferType<typeof isPolicyStatement>;

/** The single S3 `putObject` call the record writer makes, with the region and account tokens resolved. */
interface RecordWrite {
  readonly bucket: string;
  readonly key: string;
  readonly contentType: string;
  readonly body: string;
  readonly unresolvedCall: unknown;
}

/** The properties of a synthesized StackSet that the environment-independence check compares. */
interface StackSetResource {
  readonly Properties?: {
    readonly Parameters: unknown;
    readonly StackInstancesGroup: unknown;
  };
}

const ADOPTED_CONSTRUCT_ID = 'PublicationAssetsBucketStackSet';
const ACCOUNT_ID = '123456789012';
const DEPLOY_REGION = 'eu-west-1';
const STACK_SET_NAME = 'acme-artifact-buckets';
const DEPLOY_REGION_REF = { Ref: 'AWS::Region' };
const CONVENTION_BUCKET_NAME = { 'Fn::Sub': 'acme-artifacts-${AWS::Region}' };

const BASE_REGISTRY: ArtifactRegistryConfig = {
  bucketBase: 'acme-artifacts',
  project: 'acme',
  additionalRegions: ['us-east-1'],
};

const WRITERS: ArtifactWriter[] = [
  { principalArn: 'arn:aws:iam::111111111111:root' },
  { principalArn: 'arn:aws:iam::222222222222:role/publisher' },
];

const MEMBER_TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'templates', 'artifact-bucket.yaml');

function synthesize(options: SynthesisOptions = {}): Template {
  const stack = new Stack(new App(), 'RegistryStack', options.env ? { env: options.env } : undefined);
  new ArtifactRegistryBuckets(stack, ADOPTED_CONSTRUCT_ID, {
    registry: { ...BASE_REGISTRY, ...options.registry },
    writers: WRITERS,
    readAllowlist: options.readAllowlist,
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

const MEMBER_BUCKET_NAME = 'acme-artifacts-eu-west-1';
const MEMBER_WRITER_ARNS = ['arn:aws:iam::111111111111:role/writer'];

/** Evaluates the intrinsic functions the member template's bucket policy uses, as CloudFormation does. */
function evaluateTemplateValue(value: unknown, evaluation: TemplateEvaluation): unknown {
  if (Array.isArray(value)) {
    return value.map(item => evaluateTemplateValue(item, evaluation));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const record: { [key: string]: unknown } = Object.fromEntries(Object.entries(value));
  const [functionName, ...otherKeys] = Object.keys(record);
  const argument = record[functionName];
  if (otherKeys.length === 0) {
    switch (functionName) {
      case 'Ref': {
        const name = String(argument);
        return evaluation.parameters[name] ?? { PublicationAssetsBucket: MEMBER_BUCKET_NAME, 'AWS::Partition': 'aws' }[name];
      }
      case 'Fn::Sub':
        return String(argument).replace(/\$\{([^}]+)\}/g, (_, name: string) =>
          String(evaluateTemplateValue({ Ref: name }, evaluation))
        );
      case 'Fn::If': {
        const [condition, whenTrue, whenFalse] = asList(argument);
        const holds = evaluateTemplateValue(evaluation.conditions[String(condition)], evaluation);
        return evaluateTemplateValue(holds ? whenTrue : whenFalse, evaluation);
      }
      case 'Fn::Join': {
        const [delimiter, items] = asList(argument);
        return asList(evaluateTemplateValue(items, evaluation)).join(String(delimiter));
      }
      case 'Fn::Equals': {
        const [left, right] = asList(evaluateTemplateValue(argument, evaluation));
        return left === right;
      }
      case 'Fn::Not': {
        const [negated] = asList(evaluateTemplateValue(argument, evaluation));
        return !negated;
      }
    }
  }
  return Object.fromEntries(Object.entries(record).map(([key, inner]) => [key, evaluateTemplateValue(inner, evaluation)]));
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function propertyOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

/** The member template's bucket policy statements for the given `ReadPrincipals` parameter. */
function memberPolicyStatements(readPrincipals: string[]): PolicyStatement[] {
  const stack = new Stack(new App(), 'MemberTemplate');
  new CfnInclude(stack, 'Member', { templateFile: MEMBER_TEMPLATE_PATH });
  const template = Template.fromStack(stack);
  const evaluation: TemplateEvaluation = {
    parameters: { Project: 'acme', WriterArns: MEMBER_WRITER_ARNS, ReadPrincipals: readPrincipals.length > 0 ? readPrincipals : [''] },
    conditions: templateSection(template, 'Conditions'),
  };
  const policy = Object.values(template.findResources('AWS::S3::BucketPolicy'))[0];
  const statements = evaluateTemplateValue(
    propertyOf(propertyOf(propertyOf(policy, 'Properties'), 'PolicyDocument'), 'Statement'),
    evaluation
  );
  const errors: string[] = [];
  if (!t.isArray(isPolicyStatement)(statements, { errors })) {
    throw new Error(errors.join('; '));
  }
  return statements;
}

function actionsOf(statement: PolicyStatement): string[] {
  return [statement.Action ?? []].flat();
}

function isWriterStatement(statement: PolicyStatement): boolean {
  return typeof statement.Principal === 'object' && JSON.stringify(statement.Principal.AWS) === JSON.stringify(MEMBER_WRITER_ARNS);
}

function nonWriterAllows(statements: PolicyStatement[]): PolicyStatement[] {
  return statements.filter(statement => statement.Effect === 'Allow' && !isWriterStatement(statement));
}

/** The entries of one top-level section of the template, by logical ID. */
function templateSection(template: Template, section: 'Conditions' | 'Rules'): { [logicalId: string]: unknown } {
  const synthesized: unknown = template.toJSON();
  if (typeof synthesized !== 'object' || synthesized === null) {
    return {};
  }
  const entries: unknown = Reflect.get(synthesized, section);
  if (typeof entries !== 'object' || entries === null) {
    return {};
  }
  return Object.fromEntries(Object.entries(entries));
}

/** The rules the construct declares, by logical ID; the stack's own bootstrap rule is left out. */
function constructRules(template: Template): Array<[string, unknown]> {
  return Object.entries(templateSection(template, 'Rules')).filter(([logicalId]) => logicalId.startsWith(ADOPTED_CONSTRUCT_ID));
}

/** The logical ID of the condition that is true when the stack is deployed in `region`. */
function deployRegionConditionId(template: Template, region: string): string {
  const expected = JSON.stringify({ 'Fn::Equals': [DEPLOY_REGION_REF, region] });
  const match = Object.entries(templateSection(template, 'Conditions')).find(
    ([, condition]) => JSON.stringify(condition) === expected
  );
  if (match === undefined) {
    throw new Error(`no condition tests the deployment region against ${region}`);
  }
  return match[0];
}

/**
 * Renders a template value to a string: the region and account tokens become fixture values, and
 * `Fn::If` and `Fn::Sub` become `if(...)` and `sub(...)` so the deployment-time bucket choice stays
 * visible inside the serialized call.
 */
function resolveToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    if ('Ref' in value && value.Ref === 'AWS::AccountId') {
      return ACCOUNT_ID;
    }
    if ('Ref' in value && value.Ref === 'AWS::Region') {
      return DEPLOY_REGION;
    }
    if ('Ref' in value && typeof value.Ref === 'string') {
      return `Ref:${value.Ref}`;
    }
    if ('Fn::Sub' in value && typeof value['Fn::Sub'] === 'string') {
      return `sub(${value['Fn::Sub']})`;
    }
    if ('Fn::If' in value && Array.isArray(value['Fn::If'])) {
      const args: unknown[] = value['Fn::If'];
      return `if(${args.map(arg => resolveToString(arg)).join(',')})`;
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

/**
 * The parts of the template the construct itself writes. The stack synthesizer renders the CDK asset
 * locations (bucket and URL) with a literal region when the stack has an `env`, so those are left out.
 */
function registryParts(template: Template): unknown {
  const stackSets: { [logicalId: string]: StackSetResource } = template.findResources('AWS::CloudFormation::StackSet');
  const stackSetsWithoutTemplateUrl = Object.values(stackSets).map(stackSet => ({
    parameters: stackSet.Properties?.Parameters,
    stackInstancesGroup: stackSet.Properties?.StackInstancesGroup,
  }));
  return {
    conditions: templateSection(template, 'Conditions'),
    stackSets: stackSetsWithoutTemplateUrl,
    recordWriters: template.findResources('Custom::AWS'),
    policies: template.findResources('AWS::IAM::Policy'),
    rules: constructRules(template),
  };
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
          { ParameterKey: 'Project', ParameterValue: 'acme' },
          {
            ParameterKey: 'WriterArns',
            ParameterValue: 'arn:aws:iam::111111111111:root,arn:aws:iam::222222222222:role/publisher',
          },
          { ParameterKey: 'NoncurrentVersionRetentionDays', ParameterValue: '1' },
        ],
      });
    });
  });

  describe('additional regions', () => {
    it('deploys the deployment region and the additional regions without any parameter override', () => {
      synthesize({ registry: { additionalRegions: ['us-east-1', 'eu-central-1'] } }).hasResourceProperties(
        'AWS::CloudFormation::StackSet',
        {
          StackInstancesGroup: [
            { Regions: [DEPLOY_REGION_REF], ParameterOverrides: Match.absent() },
            { Regions: ['us-east-1', 'eu-central-1'], ParameterOverrides: Match.absent() },
          ],
        }
      );
    });

    it('counts an additional region listed twice once', () => {
      synthesize({ registry: { additionalRegions: ['us-east-1', 'eu-west-1', 'us-east-1'] } }).hasResourceProperties(
        'AWS::CloudFormation::StackSet',
        { StackInstancesGroup: [{ Regions: [DEPLOY_REGION_REF] }, { Regions: ['us-east-1', 'eu-west-1'] }] }
      );
    });

    it('accepts an empty list: only the deployment region gets a bucket, and no rule is declared', () => {
      const template = synthesize({ registry: { additionalRegions: [] } });

      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [{ Regions: [DEPLOY_REGION_REF] }],
      });
      expect(constructRules(template)).toEqual([]);
    });

    it('rejects a deployment in a listed region, naming the list and the automatic bucket', () => {
      const rules = constructRules(synthesize({ registry: { additionalRegions: ['us-east-1', 'eu-central-1'] } }));

      expect(rules.map(([, rule]) => rule)).toEqual([
        {
          Assertions: [
            {
              Assert: { 'Fn::Not': [{ 'Fn::Contains': [['us-east-1', 'eu-central-1'], DEPLOY_REGION_REF] }] },
              AssertDescription:
                'registry.additionalRegions lists only the additional regions (us-east-1, eu-central-1). ' +
                'The region the stack is deployed in gets a bucket automatically and must not be in that list.',
            },
          ],
        },
      ]);
    });
  });

  describe('bucket name overrides', () => {
    it('gives only the overridden additional region its own group with the override parameter', () => {
      synthesize({
        registry: { additionalRegions: ['us-east-1', 'eu-central-1'], bucketOverrides: { 'us-east-1': 'custom-use1' } },
      }).hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [
          { Regions: [DEPLOY_REGION_REF] },
          { Regions: ['eu-central-1'], ParameterOverrides: Match.absent() },
          {
            Regions: ['us-east-1'],
            ParameterOverrides: [{ ParameterKey: 'BucketNameOverride', ParameterValue: 'custom-use1' }],
          },
        ],
      });
    });

    it('chooses the deployment region override with an If chain that falls back to empty', () => {
      const template = synthesize({
        registry: {
          additionalRegions: ['us-east-1'],
          bucketOverrides: { 'eu-west-1': 'custom-euw1', 'eu-north-1': 'custom-eun1' },
        },
      });

      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        StackInstancesGroup: [
          {
            Regions: [DEPLOY_REGION_REF],
            ParameterOverrides: [
              {
                ParameterKey: 'BucketNameOverride',
                ParameterValue: {
                  'Fn::If': [
                    deployRegionConditionId(template, 'eu-west-1'),
                    'custom-euw1',
                    { 'Fn::If': [deployRegionConditionId(template, 'eu-north-1'), 'custom-eun1', ''] },
                  ],
                },
              },
            ],
          },
          { Regions: ['us-east-1'], ParameterOverrides: Match.absent() },
        ],
      });
    });

    it('declares no condition without overrides', () => {
      expect(templateSection(synthesize(), 'Conditions')).toEqual({});
    });
  });

  describe('record writer', () => {
    it('creates exactly one custom resource that depends on the StackSet', () => {
      const template = synthesize();

      template.resourceCountIs('Custom::AWS', 1);
      template.hasResource('Custom::AWS', { DependsOn: Match.arrayWith([ADOPTED_CONSTRUCT_ID]) });
    });

    it('writes to the convention bucket of the deployment region', () => {
      expect(readRecordWrite(synthesize())).toMatchObject({
        bucket: 'sub(acme-artifacts-${AWS::Region})',
        key: 'acme/registry.json',
        contentType: 'application/json',
      });
    });

    it('writes to the override bucket when the deployment region is overridden', () => {
      const template = synthesize({ registry: { bucketOverrides: { 'eu-west-1': 'custom-euw1' } } });

      expect(readRecordWrite(template).bucket).toBe(
        `if(${deployRegionConditionId(template, 'eu-west-1')},custom-euw1,sub(acme-artifacts-\${AWS::Region}))`
      );
    });

    it('waits up to 300 seconds for the write', () => {
      synthesize().hasResourceProperties('Custom::AWS', { ServiceTimeout: '300' });
    });

    it('grants s3:PutObject on exactly the record object of the deployment region bucket', () => {
      const template = synthesize({ registry: { bucketOverrides: { 'eu-west-1': 'custom-euw1' } } });

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: [
            {
              Action: 's3:PutObject',
              Effect: 'Allow',
              Resource: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':s3:::',
                    { 'Fn::If': [deployRegionConditionId(template, 'eu-west-1'), 'custom-euw1', CONVENTION_BUCKET_NAME] },
                    '/acme/registry.json',
                  ],
                ],
              },
            },
          ],
        },
      });
    });

    it('writes a record that parses with the deployment region first, then the additional regions', () => {
      const overrides = { 'us-east-1': 'custom-use1' };
      const additionalRegions = ['us-east-1', 'eu-central-1'];
      const write = readRecordWrite(synthesize({ registry: { additionalRegions, bucketOverrides: overrides } }));

      expect(parseRegistryRecord(write.body, 'record-writer')).toEqual({
        schemaVersion: 1,
        bucketBase: 'acme-artifacts',
        project: 'acme',
        regions: [DEPLOY_REGION, 'us-east-1', 'eu-central-1'],
        bucketOverrides: overrides,
        ownerAccountId: ACCOUNT_ID,
      });
    });

    it('writes a record with the deployment region alone when no region is added', () => {
      const write = readRecordWrite(synthesize({ registry: { additionalRegions: [] } }));

      expect(parseRegistryRecord(write.body, 'record-writer').regions).toEqual([DEPLOY_REGION]);
    });

    it('takes the deployment region and the owner account from pseudo parameters, never as literals', () => {
      const serializedCall = JSON.stringify(readRecordWrite(synthesize()).unresolvedCall);

      expect(serializedCall).toContain('{"Ref":"AWS::AccountId"}');
      expect(serializedCall).toContain('{"Ref":"AWS::Region"}');
      expect(serializedCall).not.toContain(ACCOUNT_ID);
      expect(serializedCall).not.toContain(DEPLOY_REGION);
    });
  });

  describe('environment independence', () => {
    it('synthesizes the same registry resources with and without an explicit env', () => {
      const registry = { additionalRegions: ['us-east-1', 'eu-central-1'], bucketOverrides: { 'eu-west-1': 'custom-euw1' } };
      const withEnv = synthesize({ env: { region: DEPLOY_REGION }, registry });
      const withoutEnv = synthesize({ registry });

      expect(registryParts(withEnv)).toEqual(registryParts(withoutEnv));
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

  describe('read access', () => {
    const READER = 'arn:aws:iam::333333333333:role/reader';

    it('without an allowlist grants one non-writer statement: GetObject and GetObjectVersion on the project prefix', () => {
      const allows = nonWriterAllows(memberPolicyStatements([]));

      expect(allows).toHaveLength(1);
      expect(allows[0].Principal).toBe('*');
      expect(actionsOf(allows[0]).sort()).toEqual(['s3:GetObject', 's3:GetObjectVersion']);
      expect([allows[0].Resource].flat()).toEqual([`arn:aws:s3:::${MEMBER_BUCKET_NAME}/acme/*`]);
    });

    it('denies unauthenticated requests: the read statement excludes the Anonymous principal type', () => {
      const allows = nonWriterAllows(memberPolicyStatements([]));

      expect(allows[0].Condition).toEqual({ StringNotEquals: { 'aws:PrincipalType': 'Anonymous' } });
    });

    it('lets no non-writer list the bucket or read its location', () => {
      for (const readPrincipals of [[], [READER]]) {
        const actions = nonWriterAllows(memberPolicyStatements(readPrincipals)).flatMap(actionsOf);

        expect(actions).not.toContain('s3:ListBucket');
        expect(actions).not.toContain('s3:GetBucketLocation');
      }
    });

    it('keeps the TLS deny on the bucket and its objects', () => {
      const denies = memberPolicyStatements([]).filter(statement => statement.Effect === 'Deny');

      expect(denies).toHaveLength(1);
      expect(denies[0]).toMatchObject({
        Principal: '*',
        Action: 's3:*',
        Condition: { Bool: { 'aws:SecureTransport': false } },
      });
      expect([denies[0].Resource].flat()).toEqual([
        `arn:aws:s3:::${MEMBER_BUCKET_NAME}`,
        `arn:aws:s3:::${MEMBER_BUCKET_NAME}/*`,
      ]);
    });

    it('with an allowlist replaces the all-principals statement by one for exactly the listed principals', () => {
      const statements = memberPolicyStatements([READER]);
      const allows = nonWriterAllows(statements);

      expect(allows).toHaveLength(1);
      expect(allows[0].Principal).toEqual({ AWS: [READER] });
      expect(actionsOf(allows[0]).sort()).toEqual(['s3:GetObject', 's3:GetObjectVersion']);
      expect(statements.filter(statement => statement.Effect === 'Allow' && statement.Principal === '*')).toEqual([]);
    });

    it('keeps the writers on Put, PutTagging, Delete, DeleteVersion and ListBucketVersions', () => {
      const writerActions = memberPolicyStatements([])
        .filter(statement => statement.Effect === 'Allow' && isWriterStatement(statement))
        .flatMap(actionsOf);

      expect(writerActions.sort()).toEqual([
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        's3:ListBucketVersions',
        's3:PutObject',
        's3:PutObjectTagging',
      ]);
    });
  });

  describe('read allowlist parameters', () => {
    it('passes Project and no ReadPrincipals without an allowlist', () => {
      const template = synthesize();

      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        Parameters: Match.arrayWith([{ ParameterKey: 'Project', ParameterValue: 'acme' }]),
      });
      template.hasResourceProperties('AWS::CloudFormation::StackSet', {
        Parameters: Match.not(Match.arrayWith([Match.objectLike({ ParameterKey: 'ReadPrincipals' })])),
      });
    });

    it('passes the allowlist principals as ReadPrincipals', () => {
      synthesize({
        readAllowlist: { principalArns: ['arn:aws:iam::333333333333:root', 'arn:aws:iam::444444444444:role/updater'] },
      }).hasResourceProperties('AWS::CloudFormation::StackSet', {
        Parameters: Match.arrayWith([
          {
            ParameterKey: 'ReadPrincipals',
            ParameterValue: 'arn:aws:iam::333333333333:root,arn:aws:iam::444444444444:role/updater',
          },
        ]),
      });
    });

    it('rejects an empty allowlist, naming readAllowlist.principalArns', () => {
      expect(() => synthesize({ readAllowlist: { principalArns: [] } })).toThrow(/readAllowlist\.principalArns is empty/);
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
