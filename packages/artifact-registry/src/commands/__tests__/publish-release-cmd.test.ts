import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import semver from 'semver';
import { unzipSync } from 'fflate';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { PublishReleaseCommand } from '../publish-release-cmd';
import { buildArtifactKey } from '../../artifacts/artifact-key';
import { runCommand } from './run-command';

const s3Mock = mockClient(S3Client);

/**
 * Pins that `publish release` writes the uploads, version pointers and release-track copies of each
 * package through an S3 client configured for that package's own region. A bucket lives in one
 * region: a write sent through a client for another region (or none) is rejected by S3 or lands
 * on the wrong endpoint, so a release that looks published is missing its pointer or tracks.
 */
describe('PublishReleaseCommand writes each package through a client for its own region', () => {
  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-release-'));
    fs.writeFileSync(path.join(dir, 'alpha.yaml'), 'alpha');
    fs.writeFileSync(path.join(dir, 'beta.yaml'), 'beta');
    const config = {
      registry: { bucketBase: 'release-bucket', project: 'example', regions: ['eu-west-1'] },
      type: 'template',
      name: 'default-name',
      artifacts: [
        { source: 'alpha.yaml', objectName: 'alpha.yaml', name: 'alpha', regions: ['eu-west-1'] },
        { source: 'beta.yaml', objectName: 'beta.yaml', name: 'beta', regions: ['us-east-1'] },
      ],
    };
    fs.writeFileSync(path.join(dir, 'artifact-registry.json'), JSON.stringify(config));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function putRegionsByKey(): Promise<Map<string, string>> {
    const regions = new Map<string, string>();
    for (const call of s3Mock.commandCalls(PutObjectCommand)) {
      const client: unknown = call.thisValue;
      if (!(client instanceof S3Client)) {
        throw new Error('PutObjectCommand was not sent through an S3Client');
      }
      const key = call.args[0].input.Key;
      if (key === undefined) {
        throw new Error('PutObjectCommand was sent without a Key');
      }
      regions.set(key, await client.config.region());
    }
    return regions;
  }

  function keysOf(name: string): string[] {
    const objectName = `${name}.yaml`;
    return [
      buildArtifactKey('template', name, { type: 'release', version: new semver.SemVer('1.2.3'), objectName, project: 'example' }),
      buildArtifactKey('template', name, { type: 'release-pointer', project: 'example' }),
      buildArtifactKey('template', name, { type: 'release-pointer', track: 'v1', project: 'example' }),
      buildArtifactKey('template', name, { type: 'release-pointer', track: 'v1.2', project: 'example' }),
      buildArtifactKey('template', name, { type: 'release-track', track: 'latest', objectName, project: 'example' }),
    ];
  }

  it('sends the uploads, pointers and track copies of each package to the region of its entries', async () => {
    const run = await runCommand(PublishReleaseCommand, ['publish', 'release', '--version', '1.2.3', '--cwd', dir]);

    expect(run.exitCode).toBe(0);
    const expected = new Map<string, string>([
      ...keysOf('alpha').map((key): [string, string] => [key, 'eu-west-1']),
      ...keysOf('beta').map((key): [string, string] => [key, 'us-east-1']),
    ]);
    expect(await putRegionsByKey()).toEqual(expected);
  });
});

/**
 * Pins that `publish release` stages a directory source into a zip, restricts every write
 * (objects, pointers, track copies) to the `--region` subset, and addresses an overridden region by
 * its override bucket. A pointer written to a region the restriction excluded, or to the convention
 * bucket of an overridden region, names objects that are absent there.
 */
describe('PublishReleaseCommand with directory sources, overrides and a region restriction', () => {
  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-release-regions-'));
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), 'index');
    const config = {
      registry: {
        bucketBase: 'example-artifacts',
        project: 'example',
        regions: ['eu-west-1', 'eu-central-1'],
        bucketOverrides: { 'eu-central-1': 'example-artifacts-fra-7f3a' },
      },
      type: 'package',
      name: 'example-ui',
      artifacts: [{ source: 'dist', objectName: 'ui.zip' }],
    };
    fs.writeFileSync(path.join(dir, 'artifact-registry.json'), JSON.stringify(config));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function putBuckets(): string[] {
    return s3Mock.commandCalls(PutObjectCommand).map(call => call.args[0].input.Bucket ?? '');
  }

  it('writes the zipped object and the pointers to the override bucket only when --region selects that region', async () => {
    const run = await runCommand(PublishReleaseCommand, ['publish', 'release', '--version', '1.2.3', '--cwd', dir, '--region', 'eu-central-1']);

    expect(run.exitCode).toBe(0);
    const calls = s3Mock.commandCalls(PutObjectCommand).map(call => call.args[0].input);
    expect(new Set(putBuckets())).toEqual(new Set(['example-artifacts-fra-7f3a']));
    const object = calls.find(input => input.Key === 'example/packages/example-ui/releases/v1.2.3/ui.zip');
    if (!(object?.Body instanceof Uint8Array)) {
      throw new Error('the zipped object was not uploaded as binary');
    }
    expect(Object.keys(unzipSync(object.Body))).toEqual(['index.html']);
    expect(calls.filter(input => input.Key?.endsWith('stable.json'))).toHaveLength(3);
  });
});
