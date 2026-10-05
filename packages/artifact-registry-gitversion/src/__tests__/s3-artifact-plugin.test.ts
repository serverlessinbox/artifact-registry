import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BumpType, IManifest, IProject, IWorkspace, PackedPackage } from '@jwpkg/gitversion';
import { S3ArtifactPlugin } from '../s3-artifact-plugin';

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
        bucketName: 'bucket-a',
        type: 'package',
        name: 'pkg',
        artifacts: [{ source: 'lambda.zip', objectName: 'lambda.zip', region: 'eu-west-1' }],
      }),
    );

    const result = await new S3ArtifactPlugin().pack(new FakeWorkspace(dir, '1.2.3'), outputFolder);

    expect(result).toEqual({
      files: [{
        name: 'lambda.zip',
        metadata: {
          package: { bucketName: 'bucket-a', artifactType: 'package', name: 'pkg' },
          key: 'serverlessinbox/packages/pkg/releases/v1.2.3/lambda.zip',
          region: 'eu-west-1',
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
  it('rejects routing metadata whose bucketName is not a string', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({
      's3-artifact': {
        'a.zip': { package: { bucketName: 5, artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip' },
      },
    });

    await expect(plugin.publish(packed, '/out/a.zip', 'tag', true)).rejects.toThrow(/s3-artifact pluginData.*bucketName/);
  });

  it('rejects routing metadata whose artifactType is unknown', async () => {
    const plugin = new S3ArtifactPlugin();
    const packed = packedPackage({
      's3-artifact': {
        'a.zip': { package: { bucketName: 'b', artifactType: 'bogus', name: 'n' }, key: 'k', objectName: 'a.zip' },
      },
    });

    await expect(plugin.publish(packed, '/out/a.zip', 'tag', true)).rejects.toThrow(/s3-artifact pluginData.*artifactType/);
  });
});
