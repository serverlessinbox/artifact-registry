import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BumpType, IManifest, IProject, IWorkspace, PackedPackage } from '@jwpkg/gitversion';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import * as t from 'typanion';
import { buildArtifactKey } from '@serverlessinbox/artifact-registry';
import type { ArtifactPackage, RegionBucket } from '@serverlessinbox/artifact-registry';
import { S3ArtifactPlugin } from '../s3-artifact-plugin';

/** One PutObject the faked S3 client received. */
interface RecordedPut {
  bucket: string;
  key: string;
  body: unknown;
}

/** The part of a written version pointer these tests read: the names of the objects it lists. */
const isPointerBody = t.isPartial({ objects: t.isArray(t.isObject({ name: t.isString() })) });

const s3Mock = mockClient(S3Client);

function packedPackage(pluginData: Record<string, unknown>): PackedPackage {
  return {
    packageRelativeCwd: '.',
    tag: 'v1.0.0',
    packageName: 'p',
    version: '1.0.0',
    previousVersion: '0.9.0',
    changeLog: { version: '1.0.0', headerLine: '', body: '' },
    commits: [],
    pluginData,
  };
}

/**
 * Stands in for the workspace gitversion hands to `pack`; only `cwd` and `version` carry meaning,
 * the rest of the interface exists to satisfy the type and fails loudly if `pack` ever touches it.
 */
class FakeWorkspace implements IProject {
  readonly manifest: IManifest = { name: 'p' };
  readonly relativeCwd = '.';
  readonly private = false;
  readonly packageName = 'p';
  readonly project: IProject = this;
  readonly tagPrefix = 'v';
  readonly workspaceDependencies: string[] = [];
  readonly childWorkspaces: IWorkspace[] = [];
  readonly workspaces: IWorkspace[] = [];

  constructor(readonly cwd: string, readonly version: string) {}

  async updateChangelog(): Promise<string> {
    throw new Error('FakeWorkspace.updateChangelog is not used by pack');
  }

  async updateVersion(): Promise<void> {
    throw new Error('FakeWorkspace.updateVersion is not used by pack');
  }

  async detectBumpType(): Promise<BumpType> {
    throw new Error('FakeWorkspace.detectBumpType is not used by pack');
  }
}

/**
 * Pins that `S3ArtifactPlugin.pack` stages nothing for a workspace without an artifact config and
 * records, per staged file, the versioned release key that `publish` later uploads to. A wrong key
 * here uploads an artifact to a path no resolver reads.
 */
describe('S3ArtifactPlugin.pack', () => {
  let dir: string;
  let outputFolder: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-artifact-plugin-'));
    outputFolder = path.join(dir, 'out');
    fs.mkdirSync(outputFolder);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a workspace without an artifact config', async () => {
    const result = await new S3ArtifactPlugin().pack(new FakeWorkspace(dir, '1.2.3'), outputFolder);

    expect(result).toBeNull();
  });

  it('records the release key and routing of each staged file', async () => {
    fs.writeFileSync(path.join(dir, 'lambda.zip'), 'zip-bytes');
    fs.writeFileSync(
      path.join(dir, 'artifact-registry.json'),
      JSON.stringify({
        registry: { bucketBase: 'bucket-a', project: 'example', regions: ['eu-west-1'] },
        type: 'package',
        name: 'pkg',
        artifacts: [{ source: 'lambda.zip', objectName: 'lambda.zip' }],
      }),
    );

    const result = await new S3ArtifactPlugin().pack(new FakeWorkspace(dir, '1.2.3'), outputFolder);

    expect(result).toEqual({
      files: [{
        name: 'lambda.zip',
        metadata: {
          package: { project: 'example', artifactType: 'package', name: 'pkg' },
          key: 'example/packages/pkg/releases/v1.2.3/lambda.zip',
          targets: [{ region: 'eu-west-1', bucketName: 'bucket-a-eu-west-1' }],
          objectName: 'lambda.zip',
        },
      }],
    });
    expect(fs.readFileSync(path.join(outputFolder, 'lambda.zip'), 'utf8')).toBe('zip-bytes');
  });
});

/**
 * Pins that `S3ArtifactPlugin.publish` validates the routing in the package's plugin data and
 * throws a field-level error for a malformed entry, rather than uploading to a wrong bucket or key.
 * Runs with `dryRun` true so no upload is attempted.
 */
describe('S3ArtifactPlugin.publish rejects malformed pluginData', () => {
  it('rejects routing metadata whose project is not a string', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({
      's3-artifact': {
        'a.zip': { package: { project: 5, artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip', targets: [] },
      },
    });

    await expect(plugin.publish(packed, '/out/a.zip', 'tag', true)).rejects.toThrow(/s3-artifact pluginData.*project/);
  });

  it('rejects routing metadata whose artifactType is unknown', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({
      's3-artifact': {
        'a.zip': { package: { project: 'p', artifactType: 'bogus', name: 'n' }, key: 'k', objectName: 'a.zip', targets: [] },
      },
    });

    await expect(plugin.publish(packed, '/out/a.zip', 'tag', true)).rejects.toThrow(/s3-artifact pluginData.*artifactType/);
  });
});

/**
 * Pins the order `S3ArtifactPlugin.publish` writes in: a file goes to every one of its targets, and
 * a package's version pointers are written exactly once, only after the last of the package's files
 * is uploaded. A pointer written earlier names objects that do not exist yet, and a pointer written
 * per file is rewritten repeatedly with a partial object list. S3 is the faked boundary; keys come
 * from the real `buildArtifactKey`.
 */
describe('S3ArtifactPlugin.publish upload and pointer order', () => {
  const euBucket: RegionBucket = { region: 'eu-west-1', bucketName: 'example-eu' };
  const usBucket: RegionBucket = { region: 'us-east-1', bucketName: 'example-us' };
  const examplePackage: ArtifactPackage = { project: 'example', artifactType: 'package', name: 'example-pkg' };
  const otherPackage: ArtifactPackage = { project: 'example', artifactType: 'package', name: 'example-other' };
  const examplePointerKey = buildArtifactKey('package', 'example-pkg', { type: 'release-pointer', project: 'example' });

  let dir: string;

  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3-artifact-publish-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function releaseKey(pkg: ArtifactPackage, objectName: string): string {
    return buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version: { version: '1.0.0' }, objectName, project: pkg.project });
  }

  function routingFor(pkg: ArtifactPackage, objectName: string, targets: RegionBucket[]): Record<string, unknown> {
    return { package: pkg, key: releaseKey(pkg, objectName), objectName, targets };
  }

  function writeSource(basename: string): string {
    const filePath = path.join(dir, basename);
    fs.writeFileSync(filePath, `bytes of ${basename}`);
    return filePath;
  }

  function recordedPuts(): RecordedPut[] {
    return s3Mock.commandCalls(PutObjectCommand).map(call => {
      const { Bucket, Key, Body } = call.args[0].input;
      if (Bucket === undefined || Key === undefined) {
        throw new Error('PutObjectCommand was sent without a Bucket or Key');
      }
      return { bucket: Bucket, key: Key, body: Body };
    });
  }

  function pointerPuts(): RecordedPut[] {
    return recordedPuts().filter(put => put.key === examplePointerKey);
  }

  function pointerObjectNames(pointer: RecordedPut): string[] {
    const body: unknown = JSON.parse(String(pointer.body));
    return t.as(body, isPointerBody, { throw: true }).objects.map(object => object.name);
  }

  it('writes no pointer after the first file of a two-file package and one pointer per target, listing both objects, after the second', async () => {
    const plugin = new S3ArtifactPlugin();
    const targets = [euBucket, usBucket];
    const packed = packedPackage({
      's3-artifact': {
        'a.zip': routingFor(examplePackage, 'a.zip', targets),
        'b.zip': routingFor(examplePackage, 'b.zip', targets),
        'c.zip': routingFor(otherPackage, 'c.zip', targets),
      },
    });

    await plugin.publish(packed, writeSource('a.zip'), 'tag', false);

    expect(recordedPuts()).toHaveLength(2);
    expect(pointerPuts()).toHaveLength(0);

    await plugin.publish(packed, writeSource('b.zip'), 'tag', false);

    const pointers = pointerPuts();
    expect(pointers.map(put => put.bucket).sort()).toEqual(['example-eu', 'example-us']);
    for (const pointer of pointers) {
      expect(pointerObjectNames(pointer)).toEqual(['a.zip', 'b.zip']);
    }
  });

  it('writes the pointers after the single publish of a one-file package', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({ 's3-artifact': { 'a.zip': routingFor(examplePackage, 'a.zip', [euBucket]) } });

    await plugin.publish(packed, writeSource('a.zip'), 'tag', false);

    const pointers = pointerPuts();
    expect(pointers).toHaveLength(1);
    expect(pointers[0].bucket).toBe('example-eu');
    expect(pointerObjectNames(pointers[0])).toEqual(['a.zip']);
  });

  it('uploads a file to the bucket of every target region', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({ 's3-artifact': { 'a.zip': routingFor(examplePackage, 'a.zip', [euBucket, usBucket]) } });

    await plugin.publish(packed, writeSource('a.zip'), 'tag', false);

    const objectPuts = recordedPuts().filter(put => put.key === releaseKey(examplePackage, 'a.zip'));
    expect(objectPuts.map(put => put.bucket).sort()).toEqual(['example-eu', 'example-us']);
  });

  it('sends no S3 command in a dry run and logs each target', async () => {
    const log = jest.spyOn(console, 'log');
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({ 's3-artifact': { 'a.zip': routingFor(examplePackage, 'a.zip', [euBucket, usBucket]) } });

    await plugin.publish(packed, writeSource('a.zip'), 'tag', true);

    expect(s3Mock.calls()).toHaveLength(0);
    const logged = log.mock.calls.map(args => args.join(' '));
    expect(logged.filter(line => line.includes('s3://example-eu/'))).toHaveLength(1);
    expect(logged.filter(line => line.includes('s3://example-us/'))).toHaveLength(1);
  });
});
