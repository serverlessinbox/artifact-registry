import { registryRecordKey, type RegistryRecord } from '@serverlessinbox/artifact-registry/registry';
import { Aws, CfnCondition, CfnRule, Duration, Fn, Stack, Token } from 'aws-cdk-lib';
import * as cloudformation from 'aws-cdk-lib/aws-cloudformation';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'node:path';

/**
 * Where the registry's artifacts live: the naming of every region's bucket, the key prefix of every
 * object, and the regions that get a bucket. The same values are written into the registry record,
 * so readers that load the record find the buckets this configuration creates.
 */
export interface ArtifactRegistryConfig {
  /**
   * The name every region's bucket starts with; the bucket of a region is named
   * `{bucketBase}-{region}` unless `bucketOverrides` names that region.
   *
   * Bucket names are global across AWS, so pick a base that no one else has taken. Changing the
   * base of a deployed registry renames its buckets.
   */
  readonly bucketBase: string;

  /**
   * The prefix that leads every object key in the buckets, for example `acme` gives keys
   * `acme/...`. The registry record is written to `{project}/registry.json`.
   *
   * Pass a short, stable name for your project. It must not be empty.
   */
  readonly project: string;

  /**
   * The regions that get a bucket in addition to the region the stack is deployed in, as region
   * names such as `us-east-1`. The list may be empty.
   *
   * The region the stack is deployed in always gets a bucket and holds the registry record, so it
   * is not listed here. The stack needs no `env`: that region is known only at deployment, and a
   * CloudFormation rule in the stack rejects a deployment whose region is listed here, with a
   * message naming this list. A region listed twice is counted once. The registry record holds the
   * deployment region followed by the regions listed here.
   */
  readonly additionalRegions: string[];

  /**
   * Bucket names that replace the `{bucketBase}-{region}` name for individual regions, keyed by
   * region name.
   *
   * An override applies to every region that gets a bucket, including the region the stack is
   * deployed in: the bucket, the registry record and the record write all use it. Leave it out to
   * use the convention name everywhere.
   *
   * @default - every region uses `{bucketBase}-{region}`
   */
  readonly bucketOverrides?: { [region: string]: string };
}

/**
 * An AWS principal that may write objects to every registry bucket.
 */
export interface ArtifactWriter {
  /**
   * The ARN of the principal that publishes artifacts, for example `arn:aws:iam::111111111111:root`
   * for every principal of an account that delegates to IAM, or the ARN of one role.
   *
   * The ARN is written into each bucket's policy as a principal. Pass a well-formed ARN: S3 rejects a
   * bucket policy whose principal it cannot resolve.
   */
  readonly principalArn: string;
}

/**
 * The principals that may read objects from the registry buckets, in place of everyone.
 */
export interface ReadAllowlist {
  /**
   * The ARNs of the principals that may read the registry's objects, for example
   * `arn:aws:iam::111111111111:root` for every principal of an account that delegates to IAM, or the
   * ARN of one role. Release and channel objects, release pointers and the registry record are all
   * read with these permissions.
   *
   * Without a read allowlist the objects under the project prefix are readable by every authenticated
   * AWS principal; unauthenticated requests are always denied. With one, the buckets answer only the
   * listed principals: every other reader, including a CloudFormation or Lambda request made by a
   * principal that is not listed, receives an access-denied response. List every account and role that deploys from or updates against this
   * registry, plus the principals that run `registry-record` and `resolve-artifacts`.
   *
   * The ARNs are written into each bucket's policy as principals. Pass well-formed ARNs: S3 rejects a
   * bucket policy whose principal it cannot resolve. The list must not be empty, otherwise synthesis
   * fails; leave `readAllowlist` out to let every authenticated AWS principal read.
   */
  readonly principalArns: string[];
}

/**
 * Properties of `ArtifactRegistryBuckets`.
 */
export interface ArtifactRegistryBucketsProps {
  /**
   * Which buckets to create and how to name them. The region the stack is deployed in and every
   * region in `registry.additionalRegions` get a bucket, and the bucket of the deployment region receives the
   * registry record. The stack needs no `env`: the deployment region is chosen when the stack is
   * deployed.
   */
  readonly registry: ArtifactRegistryConfig;

  /**
   * The principals that may write objects to the buckets. They are added to every bucket's policy.
   *
   * Pass at least one: a registry that nobody can write to cannot receive artifacts.
   */
  readonly writers: ArtifactWriter[];

  /**
   * Restricts who may read the registry's objects to the listed principals. Readers fetch objects
   * with `s3:GetObject` and `s3:GetObjectVersion`: CloudFormation reading templates, Lambda reading
   * function code and the tools that read release pointers and the registry record.
   *
   * Leave it out and every authenticated AWS principal may read the objects under
   * `registry.project`; unauthenticated requests are denied, and no one but the writers may list the
   * bucket. Set it and that permission is replaced by one for exactly the listed principals, and
   * everyone else is denied. A reader that asks for an object that does not exist
   * is answered access-denied in both cases, because readers cannot list the bucket.
   *
   * @default - every authenticated AWS principal may read the objects under `registry.project`
   */
  readonly readAllowlist?: ReadAllowlist;

  /**
   * How long earlier versions of overwritten keys stay retrievable: channel objects and pointer
   * files. A deployment that resolved an older channel object version can still roll back or
   * redeploy within this window. Release objects are never overwritten and are not affected.
   *
   * Buckets are versioned, so S3 keeps every earlier version until this time has passed and then
   * removes it permanently; a longer window adds S3 storage for those earlier versions.
   *
   * Must be a whole number of days, otherwise synthesis fails, and at least 1 day, otherwise the
   * StackSet parameter rejects it at deployment.
   *
   * @default Duration.days(1)
   */
  readonly channelHistoryRetention?: Duration;

  /**
   * The name of the CloudFormation StackSet that deploys the buckets, unique in the account.
   *
   * Changing the name of a deployed StackSet makes CloudFormation replace the StackSet.
   */
  readonly stackSetName: string;

  /**
   * The role CloudFormation assumes in this account to administer the StackSet. It must be allowed
   * to assume `stackSetExecutionRole`, and CloudFormation must be able to assume it.
   *
   * The construct creates no role of its own; create the role in the stack that holds the
   * construct, or pass an imported one.
   */
  readonly stackSetAdministrationRole: iam.IRole;

  /**
   * The role in this account that the administration role assumes to create the bucket stacks. It
   * needs permission to manage CloudFormation stacks and to create and configure S3 buckets and
   * their bucket policies. Its name is passed to the StackSet as the execution role name.
   */
  readonly stackSetExecutionRole: iam.IRole;
}

/**
 * A bucket name override and the condition that is true when the stack is deployed in the
 * overridden region.
 */
interface DeployRegionOverride {
  readonly isDeployRegion: CfnCondition;
  readonly bucketName: string;
}

const MEMBER_TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'artifact-bucket.yaml');

/**
 * The S3 buckets of an artifact registry, one per region, and the registry record that describes
 * them.
 *
 * The buckets are deployed by a CloudFormation StackSet that targets this account in the region the
 * stack is deployed in and in every region of `registry.additionalRegions`, so adding a region adds a bucket
 * without any per-region bootstrap. The record, which holds the registry configuration and the
 * owning account, is written to the bucket of the deployment region. The construct is
 * environment-agnostic: the deployment region is a CloudFormation pseudo parameter, and a
 * CloudFormation rule rejects a deployment in a region that is also listed in `registry.additionalRegions`.
 *
 * The construct creates no IAM roles: the StackSet administration and execution roles are passed
 * in.
 */
export class ArtifactRegistryBuckets extends Construct {
  constructor(scope: Construct, id: string, props: ArtifactRegistryBucketsProps) {
    super(scope, id);

    const registry: ArtifactRegistryConfig = {
      ...props.registry,
      additionalRegions: [...new Set(props.registry.additionalRegions)],
    };
    const retentionDays = (props.channelHistoryRetention ?? Duration.days(1)).toDays();
    const readPrincipalParameters = this.buildReadPrincipalParameters(props.readAllowlist);
    const deployRegionOverrides = this.declareDeployRegionOverrides(registry.bucketOverrides ?? {});

    const memberTemplate = new s3assets.Asset(this, 'member-template', { path: MEMBER_TEMPLATE_PATH });

    // CDK drops a child id of 'Default' from the logical ID and adds no hash for a single remaining
    // component, so the StackSet's logical ID equals this construct's id.
    const stackSet = new cloudformation.CfnStackSet(this, 'Default', {
      stackSetName: props.stackSetName,
      permissionModel: 'SELF_MANAGED',
      administrationRoleArn: props.stackSetAdministrationRole.roleArn,
      executionRoleName: props.stackSetExecutionRole.roleName,
      templateUrl: memberTemplate.httpUrl,
      parameters: [
        { parameterKey: 'BaseName', parameterValue: registry.bucketBase },
        { parameterKey: 'Project', parameterValue: registry.project },
        ...readPrincipalParameters,
        {
          parameterKey: 'WriterArns',
          parameterValue: props.writers.map(writer => writer.principalArn).join(','),
        },
        {
          parameterKey: 'NoncurrentVersionRetentionDays',
          parameterValue: String(retentionDays),
        },
      ],
      stackInstancesGroup: this.buildStackInstanceGroups(registry, deployRegionOverrides),
    });

    stackSet.node.addDependency(memberTemplate);
    stackSet.node.addDependency(props.stackSetAdministrationRole);
    stackSet.node.addDependency(props.stackSetExecutionRole);

    this.requireDeployRegionNotListed(registry.additionalRegions);
    const deployRegionBucketName = this.chooseDeployRegionBucketName(
      deployRegionOverrides,
      Fn.sub(`${registry.bucketBase}-\${AWS::Region}`)
    );
    const recordWriter = this.writeRecord(registry, deployRegionBucketName);
    recordWriter.node.addDependency(stackSet);
  }

  /**
   * The `ReadPrincipals` StackSet parameter of an allowlist, or none without one: the member template
   * defaults the parameter to empty, which lets every authenticated AWS principal read.
   */
  private buildReadPrincipalParameters(
    readAllowlist: ReadAllowlist | undefined
  ): cloudformation.CfnStackSet.ParameterProperty[] {
    if (readAllowlist === undefined) {
      return [];
    }
    if (readAllowlist.principalArns.length === 0) {
      throw new Error(
        'readAllowlist.principalArns is empty: list the principals that may read, or leave readAllowlist out to let every authenticated AWS principal read.'
      );
    }
    return [{ parameterKey: 'ReadPrincipals', parameterValue: readAllowlist.principalArns.join(',') }];
  }

  /**
   * Makes CloudFormation reject a deployment in a region that `registry.additionalRegions` lists, because the
   * deployment region gets its bucket automatically and listing it as well would describe it twice.
   * With no additional regions there is nothing to reject.
   */
  private requireDeployRegionNotListed(additionalRegions: string[]): void {
    if (additionalRegions.length === 0) {
      return;
    }
    new CfnRule(this, 'deploy-region-not-listed', {
      assertions: [
        {
          assert: Fn.conditionNot(Fn.conditionContains(additionalRegions, Aws.REGION)),
          assertDescription:
            `registry.additionalRegions lists only the additional regions (${additionalRegions.join(', ')}). ` +
            'The region the stack is deployed in gets a bucket automatically and must not be in that list.',
        },
      ],
    });
  }

  /**
   * One condition per overridden region, true when the stack is deployed in that region, so the
   * bucket name of the deployment region is chosen at deployment instead of computed at synthesis.
   */
  private declareDeployRegionOverrides(overrides: { [region: string]: string }): DeployRegionOverride[] {
    return Object.entries(overrides).map(([region, bucketName]) => ({
      isDeployRegion: new CfnCondition(this, `deploy-region-is-${region}`, {
        expression: Fn.conditionEquals(Aws.REGION, region),
      }),
      bucketName,
    }));
  }

  /**
   * The bucket name of the deployment region: the override of the region the stack is deployed in,
   * or `otherwise` when that region has none.
   */
  private chooseDeployRegionBucketName(deployRegionOverrides: DeployRegionOverride[], otherwise: string): string {
    return deployRegionOverrides.reduceRight(
      (fallback, { isDeployRegion, bucketName }) =>
        Token.asString(Fn.conditionIf(isDeployRegion.logicalId, bucketName, fallback)),
      otherwise
    );
  }

  /**
   * Writes the registry record into the bucket named `bucketName` with a single S3 `PutObject`, and
   * writes it again whenever the record changes. The caller adds the dependency on whatever creates
   * the bucket.
   */
  private writeRecord(registry: ArtifactRegistryConfig, bucketName: string): cr.AwsCustomResource {
    const key = registryRecordKey(registry.project);
    const body = Stack.of(this).toJsonString(this.buildRecord(registry));

    const putRecord: cr.AwsSdkCall = {
      service: 'S3',
      action: 'putObject',
      parameters: {
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      },
      physicalResourceId: cr.PhysicalResourceId.of(`s3://${bucketName}/${key}`),
    };

    return new cr.AwsCustomResource(this, 'record-writer', {
      onCreate: putRecord,
      onUpdate: putRecord,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['s3:PutObject'],
          resources: [`arn:${Aws.PARTITION}:s3:::${bucketName}/${key}`],
        }),
      ]),
      installLatestAwsSdk: false,
      serviceTimeout: Duration.minutes(5),
    });
  }

  /**
   * The deployment region has a group of its own, which carries the `BucketNameOverride` parameter
   * only when some region is overridden: its value is the override of the deployment region, or
   * empty. The additional regions that keep the convention bucket name share one group, and each
   * additional region with an override gets a group that carries its name.
   */
  private buildStackInstanceGroups(
    registry: ArtifactRegistryConfig,
    deployRegionOverrides: DeployRegionOverride[]
  ): cloudformation.CfnStackSet.StackInstancesProperty[] {
    const overrides = registry.bucketOverrides ?? {};
    const deploymentTargets = { accounts: [Aws.ACCOUNT_ID] };

    const deployRegionGroup = {
      deploymentTargets,
      regions: [Aws.REGION],
      ...(deployRegionOverrides.length > 0
        ? {
            parameterOverrides: [
              {
                parameterKey: 'BucketNameOverride',
                parameterValue: this.chooseDeployRegionBucketName(deployRegionOverrides, ''),
              },
            ],
          }
        : {}),
    };

    const conventionRegions = registry.additionalRegions.filter(region => overrides[region] === undefined);
    const conventionGroups = conventionRegions.length > 0 ? [{ deploymentTargets, regions: conventionRegions }] : [];

    const overrideGroups = registry.additionalRegions
      .filter(region => overrides[region] !== undefined)
      .map(region => ({
        deploymentTargets,
        regions: [region],
        parameterOverrides: [{ parameterKey: 'BucketNameOverride', parameterValue: overrides[region] }],
      }));

    return [deployRegionGroup, ...conventionGroups, ...overrideGroups];
  }

  private buildRecord(registry: ArtifactRegistryConfig): RegistryRecord {
    return {
      schemaVersion: 1,
      bucketBase: registry.bucketBase,
      project: registry.project,
      regions: [Aws.REGION, ...registry.additionalRegions],
      ...(registry.bucketOverrides ? { bucketOverrides: registry.bucketOverrides } : {}),
      ownerAccountId: Aws.ACCOUNT_ID,
    };
  }
}
