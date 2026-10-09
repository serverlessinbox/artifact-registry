import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { ArtifactCode } from '../artifact-code';
import { ArtifactZone, type ArtifactPin } from '../artifact-resolution';
import { ImportedArtifactBuckets } from '../imported-artifact-buckets';
import { PinnedArtifactResolver } from '../pinned-artifact-resolver';

/**
 * Pins how a Lambda's code is read from the registry: the bucket, key and S3 object version that
 * land in the function's `Code`, the bucket import shared per stack, and the absence of any
 * cross-stack export. A missing `S3ObjectVersion` lets an overwritten channel object change a
 * running function, and an `Fn::ImportValue` or `Export` ties every stack to another.
 */

const REGIONAL_KEY = 'acme/packages/mailbox-go/releases/v1.2.3/lambdas/api.zip';
const REGIONAL_BUCKET = 'acme-artifacts-eu-west-1';

function resolverOf(
  objectVersionIds?: { [s3Key: string]: string },
): PinnedArtifactResolver {
  const packages: { [packageName: string]: ArtifactPin } = {
    'mailbox-go': { zone: ArtifactZone.REGIONAL, version: '1.2.3' },
    'mailbox-cdk-edge': { zone: ArtifactZone.EDGE, version: '1.2.3' },
  };
  return new PinnedArtifactResolver({
    packages,
    location: { bucketBase: 'acme-artifacts', project: 'acme' },
    deploymentRegion: 'eu-west-1',
    objectVersionIds,
  });
}

function addLambda(stack: Stack, id: string, resolver: PinnedArtifactResolver, packageName: string): void {
  new lambda.Function(stack, id, {
    runtime: lambda.Runtime.PROVIDED_AL2023,
    handler: 'bootstrap',
    code: new ArtifactCode(stack, resolver, packageName, 'lambdas/api.zip'),
  });
}

function holdersIn(stack: Stack): ImportedArtifactBuckets[] {
  return stack.node.findAll().filter((child) => child instanceof ImportedArtifactBuckets);
}

describe('ArtifactCode', () => {
  it('is an S3Code', () => {
    const stack = new Stack(new App(), 'Stack');

    expect(new ArtifactCode(stack, resolverOf(), 'mailbox-go', 'lambdas/api.zip')).toBeInstanceOf(lambda.S3Code);
  });

  it('reads the function code from the resolved bucket and key', () => {
    const stack = new Stack(new App(), 'Stack');
    addLambda(stack, 'Api', resolverOf(), 'mailbox-go');

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Code: Match.objectEquals({ S3Bucket: REGIONAL_BUCKET, S3Key: REGIONAL_KEY }),
    });
  });

  it('adds the S3 object version when the resolver pins one', () => {
    const stack = new Stack(new App(), 'Stack');
    addLambda(stack, 'Api', resolverOf({ [REGIONAL_KEY]: 'ver-7' }), 'mailbox-go');

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
      Code: Match.objectEquals({ S3Bucket: REGIONAL_BUCKET, S3Key: REGIONAL_KEY, S3ObjectVersion: 'ver-7' }),
    });
  });

  it('shares one imported bucket between Lambdas of one bucket and imports a second bucket separately', () => {
    const stack = new Stack(new App(), 'Stack');
    const resolver = resolverOf();
    addLambda(stack, 'ApiOne', resolver, 'mailbox-go');
    addLambda(stack, 'ApiTwo', resolver, 'mailbox-go');

    const [holder] = holdersIn(stack);
    expect(holder.node.children).toHaveLength(1);

    addLambda(stack, 'Edge', resolver, 'mailbox-cdk-edge');

    expect(holdersIn(stack)).toHaveLength(1);
    expect(holder.node.children).toHaveLength(2);
  });

  it('imports into the stack of the scope and leaves no cross-stack reference in the template', () => {
    const app = new App();
    const stackA = new Stack(app, 'StackA');
    const stackB = new Stack(app, 'StackB');
    addLambda(stackA, 'Api', resolverOf(), 'mailbox-go');
    addLambda(stackB, 'Api', resolverOf(), 'mailbox-go');

    expect(holdersIn(stackA)).toHaveLength(1);
    expect(holdersIn(stackB)).toHaveLength(1);
    for (const stack of [stackA, stackB]) {
      expect(JSON.stringify(Template.fromStack(stack).toJSON())).not.toMatch(/Fn::ImportValue|"Export"/);
    }
  });
});
