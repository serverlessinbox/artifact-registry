import {
  buildArtifactBucketName,
  registryRecordKey,
  type RegistryRecord,
} from '@serverlessinbox/artifact-registry/registry';
import { Aws, Duration, Stack } from 'aws-cdk-lib';
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
   * The additional regions that get a bucket, as region names such as `eu-west-1`.
   *
   * The region of the stack that holds this construct always gets a bucket and its bucket receives
   * the registry record, so the list may be empty. A region that is also the stack's region is
   * counted once. The stack's region followed by these regions is the set of regions written into
   * the registry record.
   */
  readonly regions: string[];

  /**
   * Bucket names that replace the `{bucketBase}-{region}` name for individual regions, keyed by
   * region name.
   *
   * An override for the stack's own region applies only when the stack has a concrete region
   * (`env.region`); with an environment-agnostic stack that region is not known at synthesis and
   * the override is not matched. Leave it out to use the convention name everywhere.
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
 * Properties of `ArtifactRegistryBuckets`.
 */
export interface ArtifactRegistryBucketsProps {
  /**
   * Which buckets to create and how to name them. The stack's own region always gets a bucket, in
   * addition to the regions listed in `registry.regions`, and that bucket receives the registry
   * record. Deploy the stack with a concrete `env.region` so the bucket name, and any override for
   * it, are known at synthesis.
   */
  readonly registry: ArtifactRegistryConfig;

  /**
   * The principals that may write objects to the buckets. They are added to every bucket's policy.
   *
   * Pass at least one: a registry that nobody can write to cannot receive artifacts.
   */
  readonly writers: ArtifactWriter[];

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

const MEMBER_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'artifact-bucket.yaml');

/**
 * The S3 buckets of an artifact registry, one per region, and the registry record that describes
 * them.
 *
 * The buckets are deployed by a CloudFormation StackSet that targets this account in the stack's
 * region and every region of `registry.regions`, so adding a region adds a bucket without any per-region bootstrap. The
 * record, which holds the registry configuration and the owning account, is written to the bucket
 * of the stack's own region.
 *
 * The construct creates no IAM roles: the StackSet administration and execution roles are passed
 * in.
 */
export class ArtifactRegistryBuckets extends Construct {
  constructor(scope: Construct, id: string, props: ArtifactRegistryBucketsProps) {
    super(scope, id);

    const stackRegion = Stack.of(this).region;
    const registry: ArtifactRegistryConfig = {
      ...props.registry,
      regions: [...new Set([stackRegion, ...props.registry.regions])],
    };
    const retentionDays = (props.channelHistoryRetention ?? Duration.days(1)).toDays();

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
        {
          parameterKey: 'WriterArns',
          parameterValue: props.writers.map(writer => writer.principalArn).join(','),
        },
        {
          parameterKey: 'NoncurrentVersionRetentionDays',
          parameterValue: String(retentionDays),
        },
      ],
      stackInstancesGroup: this.buildStackInstanceGroups(registry),
    });

    stackSet.node.addDependency(memberTemplate);
    stackSet.node.addDependency(props.stackSetAdministrationRole);
    stackSet.node.addDependency(props.stackSetExecutionRole);

    const recordWriter = this.writeRecord(registry, stackRegion);
    recordWriter.node.addDependency(stackSet);
  }

  /**
   * Writes the registry record into the bucket of `region` with a single S3 `PutObject`, and writes
   * it again whenever the record changes. The caller adds the dependency on whatever creates the
   * bucket.
   */
  private writeRecord(registry: ArtifactRegistryConfig, region: string): cr.AwsCustomResource {
    const bucketName = buildArtifactBucketName(registry, region);
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
   * One group holds every region that keeps the convention bucket name. Each region with a bucket
   * name override gets a group of its own that carries the name as the `BucketNameOverride`
   * parameter of that region's stack instance only.
   */
  private buildStackInstanceGroups(
    registry: ArtifactRegistryConfig
  ): cloudformation.CfnStackSet.StackInstancesProperty[] {
    const overrides = registry.bucketOverrides ?? {};
    const deploymentTargets = { accounts: [Aws.ACCOUNT_ID] };

    const conventionRegions = registry.regions.filter(region => overrides[region] === undefined);
    const conventionGroups = conventionRegions.length > 0 ? [{ deploymentTargets, regions: conventionRegions }] : [];

    const overrideGroups = registry.regions
      .filter(region => overrides[region] !== undefined)
      .map(region => ({
        deploymentTargets,
        regions: [region],
        parameterOverrides: [{ parameterKey: 'BucketNameOverride', parameterValue: overrides[region] }],
      }));

    return [...conventionGroups, ...overrideGroups];
  }

  private buildRecord(registry: ArtifactRegistryConfig): RegistryRecord {
    return {
      schemaVersion: 1,
      bucketBase: registry.bucketBase,
      project: registry.project,
      regions: registry.regions,
      ...(registry.bucketOverrides ? { bucketOverrides: registry.bucketOverrides } : {}),
      ownerAccountId: Aws.ACCOUNT_ID,
    };
  }
}
