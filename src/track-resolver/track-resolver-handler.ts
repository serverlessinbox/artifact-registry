/**
 * CloudFormation custom resource handler for TrackResolver (plan-a, stack-self-update).
 *
 * Pure, stateless resolver for a single package: reads its track-scoped, distTag-named pointer
 * file (e.g. `{project}/packages/{pkg}/releases/{track}/{distTag}.json`, default distTag
 * `stable`) from S3, parses version + objects, templates deterministic S3 keys via
 * `buildArtifactKey`, and returns per-object S3 key + version as CFN Data attributes (readable
 * via GetAtt). One `TrackResolver` custom resource instance per package.
 *
 * Create and Update do the same thing (resolve + return). Delete = no-op SUCCESS.
 * No SSM parameters, no state, no CAS guard, no convergence logic.
 *
 * Wraps with `wrapHandler` from `aws-custom-resources` for guaranteed HTTPS response.
 * Build: esbuild bundles to `src/track-resolver/generated/track-resolver-handler-source.ts` (minified string).
 */

import { wrapHandler } from 'aws-custom-resources';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { buildArtifactKey, DEFAULT_PROJECT, DEFAULT_DIST_TAG } from '../utils/artifact-key';
import { trackResolverObjectAttrName, trackResolverVersionAttrName } from './attr-name';
import type { LatestStablePointer } from '../utils/types';
// Type-only -- erased at compile time, zero bundle-size cost. The runtime `semver` package (its
// aggregator `parse` export transitively bundles Range/Comparator/subset, ~29KB minified -- measured
// directly, ~7x the ~4KB Code.fromInline ceiling) is deliberately not imported here; see
// `parseVersionForKey` below, which validates and duck-types instead of parsing for real.
import type { SemVer } from 'semver';

interface PackageResolution {
  version: string;
  objects: Record<string, string>;
}

/** Static PhysicalResourceId: guarantees every Update is in-place, never a replacement. */
const PHYSICAL_RESOURCE_ID = 'TrackResolver';

const s3 = new S3Client({});

const BUCKET_BASE = process.env.ARTIFACT_BUCKET_BASE ?? 'mailbox-artifacts';
const REGION = process.env.AWS_REGION ?? 'eu-west-1';
// Base config, constant for every lookup in the stack -- set once as the Lambda's env var, not
// passed per-CfnCustomResource. See build-properties.ts for the ResourceProperties shape this
// pairs with (`{ Package, Track, DistTag }`, no `Project`).
const PROJECT = process.env.PROJECT ?? DEFAULT_PROJECT;

/**
 * Validate track format before any S3 call (fail closed). Accepts both major (`v1`) and
 * major.minor (`v1.2`) shapes -- the specific major-vs-major+minor drift policy is enforced one
 * layer up, by the CDK-side `CfnParameter` AllowedPattern, not here.
 */
function validateTrack(track: string): boolean {
  return /^v\d{1,4}(\.\d{1,4})?$/.test(track);
}

/**
 * Validate `version` looks like a real semver string and duck-type it as `SemVer` for
 * `buildArtifactKey`'s `release` spec, which only ever reads `.version` off that value
 * (`artifact-key.ts:32`) -- never calls a real `semver.parse()` compare/range method. See the
 * `SemVer` type-only import above for why the real `semver` package isn't used at runtime here.
 */
function parseVersionForKey(version: string): SemVer | null {
  if (!/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) return null;
  return { version } as unknown as SemVer;
}

/**
 * Parse S3 object body as LatestStablePointer or return null.
 *
 * `Buffer.isBuffer` fast path first: a `Buffer` is only *sync*-iterable (yielding individual byte
 * numbers via its inherited `Uint8Array` iterator, not chunks) -- `for await...of` on one silently
 * produces garbage instead of throwing, since sync iterables are also legal `for await` targets.
 * Real S3 SDK responses in the Lambda Node.js runtime are a `Readable` stream (properly
 * async-iterable, yielding `Buffer` chunks), so the `for await` branch below still covers that case.
 */
async function parsePointer(body: any): Promise<LatestStablePointer | null> {
  if (!body) return null;
  try {
    let text: string;
    if (Buffer.isBuffer(body)) {
      text = body.toString('utf-8');
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(chunk);
      }
      text = Buffer.concat(chunks).toString('utf-8');
    }
    return JSON.parse(text);
  } catch (err) {
    console.error('parsePointer', err);
    return null;
  }
}

/** Resolve one package: GetObject its track-scoped, distTag-named pointer, parse, template keys. */
async function resolvePackage(
  bucket: string,
  pkg: string,
  track: string,
  project: string,
  distTag: string,
): Promise<PackageResolution | null> {
  const ctx = { p: pkg, t: track, d: distTag };
  try {
    const key = buildArtifactKey('package', pkg, {
      type: 'release-pointer',
      track,
      project,
      distTag,
    });
    console.log('resolve', { ...ctx, k: key });
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const pointer = await parsePointer(res.Body);
    if (!pointer || !pointer.version) {
      console.log('no-ptr', ctx);
      return null;
    }

    const parsedVersion = parseVersionForKey(pointer.version);
    if (!parsedVersion) {
      console.log('bad-ver', { ...ctx, v: pointer.version });
      return null;
    }

    const objects: Record<string, string> = {};
    if (pointer.objects) {
      for (const obj of pointer.objects) {
        const artifactKey = buildArtifactKey('package', pkg, {
          type: 'release',
          version: parsedVersion,
          objectName: obj.name,
          project,
        });
        objects[trackResolverObjectAttrName(pkg, obj.name)] = artifactKey;
      }
    }
    console.log('ok', { ...ctx, v: pointer.version, n: pointer.objects?.length ?? 0 });
    return { version: pointer.version, objects };
  } catch (err: any) {
    // S3 NoSuchKey is a legitimate case (pointer not yet created), safe to treat as empty Data.
    // Other operational errors (AccessDenied, throttle, network) should fail the stack update so
    // the operator sees the root cause, not a misleading "attribute not found" at the consuming resource.
    const isNotFound = err?.Code === 'NoSuchKey' || err?.name === 'NoSuchKey';
    if (isNotFound) {
      console.log('missing', ctx);
      return null;
    }
    // Operational failure: re-throw so wrapHandler sends CFN FAILED.
    console.error('err', { ...ctx, e: err });
    throw err;
  }
}

interface HandlerResponse {
  PhysicalResourceId: string;
  Data?: Record<string, string>;
}

/**
 * Resolve the one package for the track; return its per-object key + version attrs.
 * Create and Update do the identical thing -- stateless resolution, no override branch. Delete is
 * dispatched on `RequestType` (not inferred from `Track`) and is a zero-AWS-call no-op.
 */
export async function handleRequest(event: any): Promise<HandlerResponse> {
  const rt = event.RequestType;
  const { Track, Package, DistTag } = event.ResourceProperties;
  const ctx = { p: Package, t: Track, d: DistTag };
  console.log('in', { rt, ...ctx });

  if (rt === 'Delete') {
    return { PhysicalResourceId: PHYSICAL_RESOURCE_ID };
  }

  // Validate track format -- fail closed, zero AWS calls, before any S3 access.
  if (!validateTrack(Track)) {
    throw new Error(`bad track: ${Track}`);
  }

  // DistTag defaults sanely so the resolver stays testable standalone. Project is base config,
  // not a per-resource property -- read once from the `PROJECT` env var (module-level, above).
  const distTag_resolved: string = DistTag ?? DEFAULT_DIST_TAG;

  const bucket = `${BUCKET_BASE}-${REGION}`;
  const resolution = await resolvePackage(bucket, Package, Track, PROJECT, distTag_resolved);

  // Data attrs for the one resolved package: version + per-object keys. Left empty if the
  // package failed to resolve (missing/malformed pointer) -- same partial-failure behavior as
  // before, just scoped to a single package instead of a multi-package merge.
  const data: Record<string, string> = {};
  if (resolution) {
    data[trackResolverVersionAttrName(Package)] = resolution.version;
    Object.assign(data, resolution.objects);
  }

  console.log('out', { ...ctx, v: resolution?.version, n: Object.keys(data).length });
  return { PhysicalResourceId: PHYSICAL_RESOURCE_ID, Data: data };
}

export const handler = wrapHandler(handleRequest);
