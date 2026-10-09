import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResolveArtifactsCommand } from '../resolve-artifacts-cmd';
import { runCommand } from './run-command';

const s3Mock = mockClient(S3Client);

function bodyOf(text: string): GetObjectCommandOutput['Body'] {
  const blob = new Blob([text]);
  return Object.assign(blob, {
    transformToString: async () => text,
    transformToByteArray: async () => new TextEncoder().encode(text),
    transformToWebStream: () => blob.stream(),
  });
}

function pointerBody(version: string): GetObjectCommandOutput['Body'] {
  return bodyOf(JSON.stringify({ version, publishedAt: '2026-01-01T00:00:00.000Z', objects: [{ name: 'a.zip' }] }));
}

/**
 * Pins that `resolve-artifacts` rejects a component that is not `key:type:name:zone` with a known
 * type and zone, naming the component and before any S3 call, and that a malformed release pointer
 * fails the run. Accepting a missing or unknown zone would bake an entry the resolver cannot place.
 */
describe('ResolveArtifactsCommand rejects malformed input', () => {
  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-artifacts-cmd-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function args(component: string): string[] {
    return ['resolve-artifacts', '--bucket-base', 'b', '--project', 'p', '--region', 'eu-west-1', '--component', component, '--output', path.join(dir, 'out.json')];
  }

  it('rejects a component whose type is neither package nor template', async () => {
    const run = await runCommand(ResolveArtifactsCommand, args('key:bogus:name:regional'));

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("--component type must be 'package' or 'template', got: bogus (component key:bogus:name:regional)");
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('rejects a component without a zone, naming the component', async () => {
    const run = await runCommand(ResolveArtifactsCommand, args('key:package:name'));

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('--component must be in the form key:type:name:zone, got: key:package:name');
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('rejects a component with an unknown zone, naming the component', async () => {
    const run = await runCommand(ResolveArtifactsCommand, args('key:package:name:global'));

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("--component zone must be 'regional' or 'edge', got: global (component key:package:name:global)");
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('rejects a release pointer that is not an object', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyOf('["not", "an", "object"]') });

    const run = await runCommand(ResolveArtifactsCommand, args('key:package:name:regional'));

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('release pointer s3://b-eu-west-1/');
  });
});

/**
 * Pins the output shape and the bucket each zone is read from: a `regional` component reads the
 * bucket of `--region` (override when one is given, else `{bucket-base}-{region}`), an `edge`
 * component reads the bucket of the edge zone's fixed region whatever `--region` says. Reading the
 * wrong bucket resolves nothing or a stale version, and a flat output loses the zone the consumer needs.
 */
describe('ResolveArtifactsCommand output and bucket selection', () => {
  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).resolves({ Body: pointerBody('1.2.3') });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-artifacts-region-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function resolve(components: string[], ...extra: string[]) {
    return runCommand(ResolveArtifactsCommand, [
      'resolve-artifacts', '--bucket-base', 'example-artifacts', '--project', 'example',
      ...components.flatMap(component => ['--component', component]),
      '--output', path.join(dir, 'out.json'), ...extra,
    ]);
  }

  function bucketsRead(): (string | undefined)[] {
    return s3Mock.commandCalls(GetObjectCommand).map(call => call.args[0].input.Bucket);
  }

  it('writes { version, zone } per component key and no other top-level key', async () => {
    const run = await resolve(['api:package:example-api:regional', 'cdn:package:example-edge:edge'], '--region', 'eu-west-1');

    expect(run.exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8'))).toEqual({
      api: { version: '1.2.3', zone: 'regional' },
      cdn: { version: '1.2.3', zone: 'edge' },
    });
  });

  it('reads an edge component from the edge-region bucket and a regional one from the --region bucket', async () => {
    await resolve(['api:package:example-api:regional', 'cdn:package:example-edge:edge'], '--region', 'eu-west-1');

    expect(bucketsRead()).toEqual(['example-artifacts-eu-west-1', 'example-artifacts-us-east-1']);
  });

  it('reads the override bucket of the region', async () => {
    const run = await resolve(['api:package:example-api:regional'], '--region', 'us-east-1', '--bucket-override', 'us-east-1=example-artifacts-use1-7f3a', '--bucket-override', 'eu-west-1=other-bucket');

    expect(run.exitCode).toBe(0);
    expect(bucketsRead()).toEqual(['example-artifacts-use1-7f3a']);
  });

  it('reads the override bucket of the edge region for an edge component', async () => {
    await resolve(['cdn:package:example-edge:edge'], '--region', 'eu-west-1', '--bucket-override', 'us-east-1=example-artifacts-use1-7f3a');

    expect(bucketsRead()).toEqual(['example-artifacts-use1-7f3a']);
  });
});
