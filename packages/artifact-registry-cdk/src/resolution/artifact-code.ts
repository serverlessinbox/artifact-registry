import { S3Code } from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';
import type { IArtifactResolver } from './artifact-resolution';
import { ImportedArtifactBuckets } from './imported-artifact-buckets';

/**
 * The Lambda `Code` of a function, read from an artifact in the registry.
 *
 * A Lambda wrapper constructs it with the resolver it was given and the package and object path of
 * its zip. The resolver decides the bucket, key and any pinned S3 object version; this class only
 * turns that location into `S3Code`. It keeps no state of its own: the imported buckets live in
 * the stack, so every Lambda of a stack that reads from one bucket shares one import.
 */
export class ArtifactCode extends S3Code {
  /**
   * The code of one object of a package.
   *
   * The code reads from the registry bucket the resolver names and, when the resolver pins the
   * object to an S3 object version, from exactly that version, so the function keeps running the
   * pinned bytes when the key is overwritten. Importing a bucket creates no resources, adds no
   * stack export and needs no bootstrap bucket.
   *
   * @param scope any construct of the stack the Lambda belongs to; the bucket import lives in that stack
   * @param resolver resolves the package's object to its bucket, key and optional version ID; throws for an unpinned package
   * @param packageName the package whose artifact holds the object, for example `mailbox-go`
   * @param objectPath the path of the zip inside the package's artifact, for example `lambdas/api.zip`
   */
  constructor(scope: Construct, resolver: IArtifactResolver, packageName: string, objectPath: string) {
    const resolved = resolver.resolve(packageName, objectPath);
    super(ImportedArtifactBuckets.of(scope).bucket(resolved.bucket), resolved.key, resolved.versionId);
  }
}
