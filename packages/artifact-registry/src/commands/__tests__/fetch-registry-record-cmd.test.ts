import { AccessDenied, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseRegistryRecord } from '../../registry';
import type { RegistryRecord } from '../../registry';
import { s3Body } from '../../__tests__/s3-body';
import { FetchRegistryRecordCommand } from '../fetch-registry-record-cmd';
import { runCommand } from './run-command';

const s3Mock = mockClient(S3Client);

const exampleRecord: RegistryRecord = {
  schemaVersion: 1,
  bucketBase: 'example-artifacts',
  project: 'example',
  regions: ['eu-west-1', 'us-east-1'],
  ownerAccountId: '123456789012',
};

function serveRecord(record: RegistryRecord): void {
  s3Mock.on(GetObjectCommand).resolves({
    Body: s3Body(JSON.stringify(record)),
  });
}

/**
 * Pins that `registry-record fetch` writes the record read from the bucket the registry location
 * names for `--region` (the override when one is given, else `{bucket-base}-{region}`) to `--output`
 * as JSON, and exits 1 naming the record as "missing or not readable" when S3 denies access.
 * Reading the wrong bucket or writing nothing would hand the caller a record that is not the
 * published one.
 */
describe('FetchRegistryRecordCommand', () => {
  let dir: string;
  let outputPath: string;

  beforeEach(() => {
    s3Mock.reset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-record-fetch-'));
    outputPath = path.join(dir, 'registry-record.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function fetchRecord(...extra: string[]) {
    return runCommand(FetchRegistryRecordCommand, [
      'registry-record', 'fetch', '--bucket-base', 'example-artifacts', '--project', 'example',
      '--region', 'eu-west-1', '--output', outputPath, ...extra,
    ]);
  }

  it('writes the record served at the convention bucket to the output file', async () => {
    serveRecord(exampleRecord);

    const run = await fetchRecord();

    expect(run.exitCode).toBe(0);
    const calls = s3Mock.commandCalls(GetObjectCommand).map(call => call.args[0].input);
    expect(calls).toEqual([{ Bucket: 'example-artifacts-eu-west-1', Key: 'example/registry.json' }]);
    expect(parseRegistryRecord(fs.readFileSync(outputPath, 'utf8'), 'output')).toEqual(exampleRecord);
  });

  it('reads the override bucket of the region', async () => {
    serveRecord(exampleRecord);

    const run = await fetchRecord('--bucket-override', 'eu-west-1=example-artifacts-euw1-7f3a');

    expect(run.exitCode).toBe(0);
    const buckets = s3Mock.commandCalls(GetObjectCommand).map(call => call.args[0].input.Bucket);
    expect(buckets).toEqual(['example-artifacts-euw1-7f3a']);
  });

  it('exits 1 naming the record as missing or not readable when S3 denies access', async () => {
    s3Mock.on(GetObjectCommand).rejects(new AccessDenied({ message: 'Access Denied', $metadata: {} }));

    const run = await fetchRecord();

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('missing or not readable');
    expect(fs.existsSync(outputPath)).toBe(false);
  });
});
