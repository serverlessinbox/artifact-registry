import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { PublishChannelCommand } from '../publish-channel-cmd';
import { runCommand } from './run-command';

jest.mock('os', () => {
  const actual = jest.requireActual<typeof os>('os');
  return { ...actual, tmpdir: jest.fn(actual.tmpdir) };
});

const s3Mock = mockClient(S3Client);
const systemTmpdir = jest.requireActual<typeof os>('os').tmpdir();

/** One PutObjectCommand the command sent: the bucket, the key and the uploaded bytes. */
interface Upload {
  bucket: string;
  key: string;
  body: Uint8Array;
}

/**
 * Pins that `publish channel` stages sources like the plugin's pack (a directory source is uploaded
 * as a zip that keeps its structure) and then uploads each staged file to the bucket of every
 * target region. A directory uploaded as-is, an override ignored, or a `--region` restriction
 * dropped publishes the wrong bytes or to the wrong bucket without any error. `os.tmpdir` is
 * redirected so the staging folder of a run can be inspected.
 */
describe('PublishChannelCommand', () => {
  let dir: string;
  let stagingParent: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-channel-'));
    stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-channel-tmp-'));
    jest.mocked(os.tmpdir).mockReturnValue(stagingParent);
    fs.mkdirSync(path.join(dir, 'dist', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'index');
    fs.writeFileSync(path.join(dir, 'dist', 'assets', 'app.js'), 'app');
    fs.writeFileSync(path.join(dir, 'tool.json'), '{}');
  });

  afterEach(() => {
    jest.mocked(os.tmpdir).mockReturnValue(systemTmpdir);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(stagingParent, { recursive: true, force: true });
  });

  function writeConfig(registry: object, artifacts: object[]): void {
    const config = { registry, type: 'package', name: 'example-ui', artifacts };
    fs.writeFileSync(path.join(dir, 'artifact-registry.json'), JSON.stringify(config));
  }

  function uploads(): Upload[] {
    return s3Mock.commandCalls(PutObjectCommand).map(call => {
      const { Bucket, Key, Body } = call.args[0].input;
      if (Bucket === undefined || Key === undefined || !(Body instanceof Uint8Array)) {
        throw new Error('PutObjectCommand was sent without a Bucket, a Key or a binary Body');
      }
      return { bucket: Bucket, key: Key, body: Body };
    });
  }

  function publish(...extra: string[]) {
    return runCommand(PublishChannelCommand, ['publish', 'channel', '--cwd', dir, ...extra]);
  }

  it('uploads a directory source as a zip that keeps the directory structure', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] }, [{ source: 'dist', objectName: 'ui.zip' }]);

    const run = await publish();

    expect(run.exitCode).toBe(0);
    const [upload] = uploads();
    expect(upload.key).toBe('example/packages/example-ui/channels/dev/ui.zip');
    const entries = unzipSync(upload.body);
    expect(Object.keys(entries).sort()).toEqual(['assets/app.js', 'index.html']);
    expect(Buffer.from(entries['assets/app.js']).toString()).toBe('app');
  });

  it('uploads to the override bucket of a region and to the convention bucket of the others', async () => {
    writeConfig(
      { bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1', 'eu-central-1'], bucketOverrides: { 'eu-central-1': 'example-artifacts-fra-7f3a' } },
      [{ source: 'tool.json', objectName: 'tool.json' }],
    );

    const run = await publish();

    expect(run.exitCode).toBe(0);
    expect(uploads().map(upload => upload.bucket).sort()).toEqual(['example-artifacts-eu-west-1', 'example-artifacts-fra-7f3a']);
  });

  it('restricts the targets to the regions given with --region', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1', 'eu-central-1'] }, [{ source: 'tool.json', objectName: 'tool.json' }]);

    const run = await publish('--region', 'eu-central-1');

    expect(run.exitCode).toBe(0);
    expect(uploads().map(upload => upload.bucket)).toEqual(['example-artifacts-eu-central-1']);
  });

  it('fails without uploading when a --region is a target of no selected artifact', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] }, [{ source: 'tool.json', objectName: 'tool.json' }]);

    const run = await publish('--region', 'eu-west-1', '--region', 'ap-south-1');

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('--region ap-south-1 matches no target');
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it('stages and uploads only the entry named by --object', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] }, [
      { source: 'dist', objectName: 'ui.zip' },
      { source: 'tool.json', objectName: 'tool.json' },
    ]);

    const run = await publish('--object', 'tool.json');

    expect(run.exitCode).toBe(0);
    expect(uploads().map(upload => upload.key)).toEqual(['example/packages/example-ui/channels/dev/tool.json']);
  });

  it('removes the staging folder after a publish and after a failed one', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] }, [{ source: 'dist', objectName: 'ui.zip' }]);

    await publish();
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).rejects(new Error('denied'));
    await publish();

    expect(fs.readdirSync(stagingParent)).toEqual([]);
  });

  it('exits non-zero naming the bucket whose upload failed', async () => {
    writeConfig({ bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1', 'eu-central-1'] }, [{ source: 'tool.json', objectName: 'tool.json' }]);
    s3Mock.on(PutObjectCommand, { Bucket: 'example-artifacts-eu-central-1' }).rejects(new Error('denied'));

    const run = await publish();

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain('example-artifacts-eu-central-1');
    expect(run.stderr).not.toContain('example-artifacts-eu-west-1 ');
  });
});
