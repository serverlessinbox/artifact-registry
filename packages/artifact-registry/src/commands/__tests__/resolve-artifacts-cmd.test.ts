import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResolveArtifactsCommand } from '../resolve-artifacts-cmd';
import { runCommand } from './run-command';

const s3Mock = mockClient(S3Client);

/**
 * Pins that `resolve-artifacts` fails with a non-zero exit code for a component of an unknown type
 * (before any S3 call) and for a release pointer that is not a valid pointer object, so no output
 * file is written from bad input.
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
    const run = await runCommand(ResolveArtifactsCommand, args('key:bogus:name'));

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("--component type must be 'package' or 'template', got: bogus");
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('rejects a release pointer that is not an object', async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: jest.fn().mockResolvedValue('["not", "an", "object"]') },
    });

    const run = await runCommand(ResolveArtifactsCommand, args('key:package:name'));

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('release pointer s3://b-eu-west-1/');
  });
});

/**
 * Pins that `resolve-artifacts` reads the pointer from the bucket the registry location names for
 * `--region`: the override when one is given for that region, else `{bucket-base}-{region}`. Reading
 * the convention bucket while the registry publishes to an override resolves nothing or stale versions.
 */
describe('ResolveArtifactsCommand reads the bucket of its region', () => {
  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: jest.fn().mockResolvedValue(JSON.stringify({ version: '1.2.3', publishedAt: '2026-01-01T00:00:00.000Z', objects: [{ name: 'a.zip' }] })) },
    });
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-artifacts-region-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function resolve(...extra: string[]) {
    return runCommand(ResolveArtifactsCommand, [
      'resolve-artifacts', '--bucket-base', 'example-artifacts', '--project', 'example', '--component', 'api:package:example-api',
      '--output', path.join(dir, 'out.json'), ...extra,
    ]);
  }

  it('reads the override bucket of the region', async () => {
    const run = await resolve('--region', 'us-east-1', '--bucket-override', 'us-east-1=example-artifacts-use1-7f3a', '--bucket-override', 'eu-west-1=other-bucket');

    expect(run.exitCode).toBe(0);
    expect(s3Mock.commandCalls(GetObjectCommand).map(call => call.args[0].input.Bucket)).toEqual(['example-artifacts-use1-7f3a']);
    expect(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')).toContain('"api": "1.2.3"');
  });

  it('reads the convention bucket when the region has no override', async () => {
    const run = await resolve('--region', 'eu-west-1', '--bucket-override', 'us-east-1=example-artifacts-use1-7f3a');

    expect(run.exitCode).toBe(0);
    expect(s3Mock.commandCalls(GetObjectCommand).map(call => call.args[0].input.Bucket)).toEqual(['example-artifacts-eu-west-1']);
  });
});
