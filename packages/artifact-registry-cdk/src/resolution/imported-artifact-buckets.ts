import { Stack } from 'aws-cdk-lib';
import { Bucket, type IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct, type IConstruct } from 'constructs';

const CONSTRUCT_ID = 'artifact-buckets';

/**
 * The imported registry buckets of one stack, one per bucket name. A stack holds a single instance,
 * so every Lambda of the stack that reads from the same bucket shares one import. It is internal to
 * this package and not part of the jsii surface.
 */
export class ImportedArtifactBuckets extends Construct {
  private readonly buckets = new Map<string, IBucket>();

  /** The holder of the stack that contains `scope`, created on first use. */
  static of(scope: IConstruct): ImportedArtifactBuckets {
    const stack = Stack.of(scope);
    const existing = stack.node.tryFindChild(CONSTRUCT_ID);
    if (existing instanceof ImportedArtifactBuckets) {
      return existing;
    }
    return new ImportedArtifactBuckets(stack, CONSTRUCT_ID);
  }

  /** The imported bucket named `bucketName`, imported on first request. */
  bucket(bucketName: string): IBucket {
    const known = this.buckets.get(bucketName);
    if (known !== undefined) {
      return known;
    }
    const imported = Bucket.fromBucketName(this, `bucket-${this.buckets.size}`, bucketName);
    this.buckets.set(bucketName, imported);
    return imported;
  }
}
