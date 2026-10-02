import type { PackedPackage } from '@jwpkg/gitversion';
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
