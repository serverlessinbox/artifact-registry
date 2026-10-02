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
    return ['resolve-artifacts', '--bucket', 'b', '--component', component, '--output', path.join(dir, 'out.json')];
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
    expect(run.stdout + run.stderr).toContain('release pointer s3://b/');
  });
});
