/**
 * Minimal CloudFormation custom resource handler for TrackResolver (plan-a, stack-self-update).
 *
 * Reads one track-scoped pointer file from S3 and returns its version.
 * CDK constructs the artifact keys using the returned version token.
 *
 * Create and Update: resolve pointer → return version.
 * Delete: no-op SUCCESS.
 *
 * CloudFormation custom-resource response wrapper using global `fetch`.
 * Build: esbuild bundles to `src/track-resolver/generated/track-resolver-handler-source.ts` (minified string).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildReleasePointerKey, DEFAULT_PROJECT } from '../utils/artifact-key';
import type { LatestStablePointer } from '../utils/types';

/** Attribute name for the resolved version in CloudFormation GetAtt. */
export const TRACK_RESOLVER_VERSION_ATTR = 'Version';

/** Static PhysicalResourceId: guarantees every Update is in-place, never a replacement. */
const PHYSICAL_RESOURCE_ID = 'TrackResolver';

const s3 = new S3Client({});

const BUCKET_BASE = process.env.ARTIFACT_BUCKET_BASE ?? 'mailbox-artifacts';
const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const PROJECT = process.env.PROJECT ?? DEFAULT_PROJECT;

/**
 * Parse S3 object body as LatestStablePointer or return null.
 * Uses AWS SDK v3's built-in `transformToString()` to handle stream→string conversion.
 */
async function parsePointer(body: any): Promise<LatestStablePointer | null> {
  if (!body) return null;
  try {
    const text = await body.transformToString('utf-8');
    return JSON.parse(text);
  } catch (err: any) {
    console.error('failed to parse pointer JSON', { error: err.message });
    return null;
  }
}

interface HandlerResponse {
  PhysicalResourceId: string;
  Data?: Record<string, string>;
}

/**
 * Resolve the one package: read its track-scoped pointer and extract version.
 * Delete is a zero-AWS-call no-op. Create/Update both resolve the pointer.
 */
export async function handleRequest(event: any): Promise<HandlerResponse> {
  const rt = event.RequestType;
  const { Track, Package, DistTag } = event.ResourceProperties;

  if (rt === 'Delete') {
    return { PhysicalResourceId: PHYSICAL_RESOURCE_ID };
  }

  const bucket = `${BUCKET_BASE}-${REGION}`;
  const key = buildReleasePointerKey('package', Package, { track: Track, distTag: DistTag, project: PROJECT });

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const pointer = await parsePointer(res.Body);

    if (!pointer || !pointer.version) {
      console.log('pointer not found or missing version', { Package, Track, DistTag });
      return { PhysicalResourceId: PHYSICAL_RESOURCE_ID, Data: {} };
    }

    console.log('resolved', { Package, Track, DistTag, version: pointer.version });
    return {
      PhysicalResourceId: PHYSICAL_RESOURCE_ID,
      Data: { [TRACK_RESOLVER_VERSION_ATTR]: pointer.version },
    };
  } catch (err: any) {
    // S3 NoSuchKey is a legitimate case (pointer not yet created), safe to treat as empty Data.
    const isNotFound = err?.Code === 'NoSuchKey' || err?.name === 'NoSuchKey';
    if (isNotFound) {
      console.log('pointer not found', { Package, Track, DistTag });
      return { PhysicalResourceId: PHYSICAL_RESOURCE_ID, Data: {} };
    }
    // Operational failure: re-throw so handler sends CFN FAILED.
    console.error('S3 error resolving package', { Package, Track, DistTag, error: err.message });
    throw err;
  }
}

/**
 * CloudFormation custom-resource response wrapper.
 * Calls handleRequest, captures the result, and sends an HTTPS response to the presigned S3 URL.
 * On error, sends a FAILED response with the error message and a CloudWatch hint.
 */
export async function handler(event: any, context: any): Promise<void> {
  let result: HandlerResponse | undefined;
  let error: any;

  try {
    result = await handleRequest(event);
  } catch (err: any) {
    error = err;
  }

  const responseData: Record<string, any> = {
    Status: error ? 'FAILED' : 'SUCCESS',
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  };

  if (error) {
    const reason = error && error.message ? String(error.message) : String(error);
    const logStream = (context && context.logStreamName) || event.RequestId;
    responseData.Reason = `${reason}. See CloudWatch log stream: ${logStream}`;
    responseData.PhysicalResourceId = event.PhysicalResourceId || PHYSICAL_RESOURCE_ID;
  } else {
    responseData.PhysicalResourceId = result!.PhysicalResourceId;
    if (result!.Data) {
      responseData.Data = result!.Data;
    }
  }

  const body = JSON.stringify(responseData);

  try {
    await fetch(event.ResponseURL, { method: 'PUT', body });
  } catch (err: any) {
    console.error('fetch response PUT failed', err);
  }
}
