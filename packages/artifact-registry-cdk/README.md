# @serverlessinbox/artifact-registry-cdk

A CDK construct that creates the S3 buckets of an artifact registry, one per region, and writes a registry record into one of them that describes the registry.

An artifact registry is a set of identically configured buckets that a build publishes versioned artifacts to and that consumers read them from. The construct keeps the buckets and the description of where they are in one place.

Built for [ServerlessInbox](https://github.com/serverlessinbox/serverlessinbox).

## What it deploys

- **A CloudFormation StackSet** that deploys one bucket in the account of the stack, in the region the stack is deployed in and in each region of `registry.additionalRegions`. Adding a region to the list adds a bucket; no per-region bootstrap is needed. Each bucket is versioned, blocks ACLs, enforces TLS, and expires replaced object versions after `channelHistoryRetention`.
- **The registry record**, a JSON object written to `{project}/registry.json` in the bucket of the region the stack is deployed in. It holds the schema version, `bucketBase`, `project`, `regions` (the deployment region followed by `registry.additionalRegions`, each once), the optional `bucketOverrides` and the account ID that owns the buckets. It is written when the stack is created and written again whenever the record changes.
- **A CloudFormation rule.** The deployment region gets a bucket automatically, so the stack needs no `env`; the rule rejects a deployment in a region that `registry.additionalRegions` also lists.

The construct creates no IAM roles and no stack outputs.

## Usage

```ts
import { ArtifactRegistryBuckets } from '@serverlessinbox/artifact-registry-cdk';

new ArtifactRegistryBuckets(stack, 'ArtifactRegistryBuckets', {
  registry: {
    bucketBase: 'acme-artifacts',
    project: 'acme',
    additionalRegions: ['us-east-1'],
  },
  writers: [{ principalArn: 'arn:aws:iam::111111111111:root' }],
  stackSetName: 'acme-artifact-buckets',
  stackSetAdministrationRole: administrationRole,
  stackSetExecutionRole: executionRole,
});
```

Deployed from `eu-west-1`, this creates buckets in `eu-west-1` and `us-east-1`. The region the stack is deployed in always gets a bucket and holds the registry record; `registry.additionalRegions` lists only the additional regions.

## Props

| Prop | Meaning |
|---|---|
| `registry.bucketBase` | Bucket names are `{bucketBase}-{region}`. |
| `registry.project` | Prefix of every object key; the record lives at `{project}/registry.json`. |
| `registry.additionalRegions` | The regions that get a bucket in addition to the region the stack is deployed in, which always gets one. The list may be empty and must not contain the deployment region; a region listed twice is counted once. |
| `registry.bucketOverrides` | Optional bucket names that replace the convention name, keyed by region. An override applies to every region that gets a bucket, including the deployment region. |
| `writers` | Principals (`principalArn`) allowed to write to every bucket. |
| `channelHistoryRetention` | Optional `Duration`, default 1 day. How long earlier versions of overwritten keys (channel objects and pointer files) stay retrievable, so a deployment that resolved an older channel object version can still roll back or redeploy within the window. Release objects are never overwritten and are not affected. A longer window adds S3 storage for those earlier versions. A whole number of days, otherwise synthesis fails, and at least 1, otherwise the StackSet parameter rejects it at deployment. |
| `stackSetName` | Name of the StackSet. |
| `stackSetAdministrationRole` | Role CloudFormation assumes to administer the StackSet. |
| `stackSetExecutionRole` | Role the administration role assumes to create the bucket stacks. |

## Bucket name overrides

A region listed in `registry.bucketOverrides` gets a bucket with that name instead of `{bucketBase}-{region}`. The override applies everywhere the bucket name matters: the bucket itself (the StackSet instance of that region receives it as its own parameter, the deployment region included), the registry record, and the target of the record write. Regions without an override keep the convention name.

Changing the override of a region that already has a bucket makes CloudFormation create a bucket under the new name while the old, retained bucket stays behind. Review such a change before deploying it.

## Requirements

- The stack needs no `env`. The region it is deployed in gets a bucket automatically and holds the record, so it must not be in `registry.additionalRegions`: a CloudFormation rule fails the deployment with a message naming that list otherwise. Deploy the stack in the region that should hold the record.
- The stack is bootstrapped: the member template is published as a CDK asset, and the record is written by an `AwsCustomResource`.
- The StackSet administration and execution roles are passed in. The execution role needs permission to manage CloudFormation stacks and to create and configure S3 buckets and bucket policies.

## Adopting existing buckets

The StackSet resource takes the logical ID of the construct id you choose. Using the id `PublicationAssetsBucketStackSet` gives the StackSet that logical ID, so a stack that already deploys a StackSet under that id keeps that StackSet instead of replacing it. The member template keeps the logical IDs of the bucket and the bucket policy.

## License

Apache-2.0
