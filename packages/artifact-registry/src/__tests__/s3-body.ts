import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';

/** The `Body` of a `GetObjectCommand` response. */
export type S3ObjectBody = NonNullable<GetObjectCommandOutput['Body']>;

/**
 * Builds a `GetObjectCommand` response body that serves `text`, satisfying the SDK's full body
 * type (a Blob with the `transformTo*` stream mixin) so a fake S3 response needs no type escape.
 */
export function s3Body(text: string): S3ObjectBody {
  const blob = new Blob([text]);
  return Object.assign(blob, {
    transformToString: async () => text,
    transformToByteArray: async () => new TextEncoder().encode(text),
    transformToWebStream: () => blob.stream(),
  });
}
