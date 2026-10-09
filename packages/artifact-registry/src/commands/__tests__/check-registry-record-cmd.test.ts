import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RegistryRecord } from '../../registry';
import { s3Body } from '../../__tests__/s3-body';
import { CheckRegistryRecordCommand } from '../check-registry-record-cmd';
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
 * Pins that `registry-record check` compares a record file with the live record in S3: equal records
 * exit 0 (regions compared as sets and bucket overrides as maps, so ordering never counts), and any
 * real difference exits 1 naming the differing field. A check that reports a match for a drifted
 * record lets a registry with the wrong owner, regions or buckets pass verification.
 */
describe('CheckRegistryRecordCommand', () => {
  let dir: string;
  let recordFile: string;

  beforeEach(() => {
    s3Mock.reset();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registry-record-check-'));
    recordFile = path.join(dir, 'registry-record.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function checkAgainstLive(fileRecord: RegistryRecord, liveRecord: RegistryRecord) {
    fs.writeFileSync(recordFile, JSON.stringify(fileRecord));
    serveRecord(liveRecord);
    return runCommand(CheckRegistryRecordCommand, ['registry-record', 'check', recordFile, '--region', 'eu-west-1']);
  }

  it('exits 0 when the file record equals the live record', async () => {
    const run = await checkAgainstLive(exampleRecord, exampleRecord);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain('matches live record');
  });

  it('exits 1 naming ownerAccountId when the owner differs', async () => {
    const run = await checkAgainstLive(exampleRecord, { ...exampleRecord, ownerAccountId: '210987654321' });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain('ownerAccountId');
    expect(run.stdout).toContain('123456789012');
    expect(run.stdout).toContain('210987654321');
  });

  it('exits 0 when the regions are equal as sets in a different order', async () => {
    const run = await checkAgainstLive(exampleRecord, { ...exampleRecord, regions: ['us-east-1', 'eu-west-1'] });

    expect(run.exitCode).toBe(0);
  });

  it('exits 0 when the bucket overrides hold the same pairs in a different key order', async () => {
    const fileRecord: RegistryRecord = {
      ...exampleRecord,
      bucketOverrides: { 'eu-west-1': 'example-artifacts-euw1-7f3a', 'us-east-1': 'example-artifacts-use1-7f3a' },
    };
    const liveRecord: RegistryRecord = {
      ...exampleRecord,
      bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a', 'eu-west-1': 'example-artifacts-euw1-7f3a' },
    };

    const run = await checkAgainstLive(fileRecord, liveRecord);

    expect(run.exitCode).toBe(0);
  });

  it('reads the live record from the bucket of --region, not the first region in the file', async () => {
    fs.writeFileSync(recordFile, JSON.stringify(exampleRecord));
    serveRecord(exampleRecord);

    const run = await runCommand(CheckRegistryRecordCommand, ['registry-record', 'check', recordFile, '--region', 'us-east-1']);

    expect(run.exitCode).toBe(0);
    const buckets = s3Mock.commandCalls(GetObjectCommand).map((call) => call.args[0].input.Bucket);
    expect(buckets).toEqual(['example-artifacts-us-east-1']);
  });

  it('exits 1 when --region is omitted', async () => {
    fs.writeFileSync(recordFile, JSON.stringify(exampleRecord));
    serveRecord(exampleRecord);

    const run = await runCommand(CheckRegistryRecordCommand, ['registry-record', 'check', recordFile]);

    expect(run.exitCode).not.toBe(0);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  it('exits 1 naming regions when one side has an extra region', async () => {
    const run = await checkAgainstLive(exampleRecord, { ...exampleRecord, regions: ['eu-west-1', 'us-east-1', 'ap-southeast-2'] });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain('regions');
    expect(run.stdout).toContain('ap-southeast-2');
  });
});
