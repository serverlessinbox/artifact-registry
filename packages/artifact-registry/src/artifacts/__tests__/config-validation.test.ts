import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadWorkspaceConfig as loadWorkspaceConfigFromRoot } from '../../index';
import { buildArtifacts } from '../build-artifacts';
import { CONFIG_FILENAME, loadWorkspaceConfig } from '../workspace-config';

/**
 * Config files are parsed JSON, so their content is untyped at runtime. Pins that
 * `loadWorkspaceConfig` and `buildArtifacts` reject a malformed config with an error naming the
 * file and the field, instead of failing later as an undefined access, that a missing config file
 * surfaces as `ENOENT` (which the commands and the plugin treat as "no config"), and that a config
 * whose artifacts would publish a package to inconsistent regions, or whose override names an
 * unused region, is rejected at load: either would otherwise publish a pointer naming objects
 * missing from its bucket, or silently ignore a misspelled region.
 */
describe('workspace config files are validated', () => {
  let dir: string;

  const registry = { bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-validation-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(fileName: string, config: unknown): void {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(config));
  }

  describe('loadWorkspaceConfig', () => {
    it('rejects a config whose artifacts is not an array', async () => {
      writeConfig(CONFIG_FILENAME, { registry, type: 'package', name: 'n', artifacts: 'nope' });

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.artifacts/);
    });

    it('rejects a config whose type is unknown', async () => {
      writeConfig(CONFIG_FILENAME, { registry, type: 'bogus', name: 'n', artifacts: [] });

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.type/);
    });

    it('returns a well-formed config', async () => {
      const config = { registry, type: 'package', name: 'n', artifacts: [{ source: 's', objectName: 'o.zip' }] };
      writeConfig(CONFIG_FILENAME, config);

      expect(await loadWorkspaceConfig(dir)).toEqual(config);
    });

    it('is importable from the package root', async () => {
      const config = { registry, type: 'package', name: 'n', artifacts: [] };
      writeConfig(CONFIG_FILENAME, config);

      expect(await loadWorkspaceConfigFromRoot(dir)).toEqual(config);
    });

    it('rejects a missing config file with the ENOENT code that callers skip on', async () => {
      await expect(loadWorkspaceConfig(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects a config file that is not valid JSON, naming the file', async () => {
      fs.writeFileSync(path.join(dir, CONFIG_FILENAME), '{ not json');

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json is not valid JSON/);
    });

    describe('registry block', () => {
      it('rejects a config without a registry', async () => {
        writeConfig(CONFIG_FILENAME, { type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry/);
      });

      it('rejects a registry without a bucketBase', async () => {
        writeConfig(CONFIG_FILENAME, { registry: { project: 'example', regions: ['eu-west-1'] }, type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry\.bucketBase/);
      });

      it('rejects a registry without a project', async () => {
        writeConfig(CONFIG_FILENAME, { registry: { bucketBase: 'example-artifacts', regions: ['eu-west-1'] }, type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry\.project/);
      });

      it('rejects an empty regions list', async () => {
        writeConfig(CONFIG_FILENAME, { registry: { ...registry, regions: [] }, type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry\.regions/);
      });

      it('rejects a regions list with a duplicate', async () => {
        writeConfig(CONFIG_FILENAME, { registry: { ...registry, regions: ['eu-west-1', 'eu-west-1'] }, type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry\.regions/);
      });

      it('rejects a bucket override that is not a valid bucket name', async () => {
        writeConfig(CONFIG_FILENAME, { registry: { ...registry, bucketOverrides: { 'eu-west-1': 'Not_A_Bucket' } }, type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.registry\.bucketOverrides/);
      });
    });

    describe('legacy keys are rejected, naming the file and the key', () => {
      it('rejects a workspace-level bucketName', async () => {
        writeConfig(CONFIG_FILENAME, { registry, bucketName: 'b', type: 'package', name: 'n', artifacts: [] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.bucketName/);
      });

      it('rejects an artifact-level bucketName', async () => {
        writeConfig(CONFIG_FILENAME, { registry, type: 'package', name: 'n', artifacts: [{ source: 's', objectName: 'o.zip', bucketName: 'b' }] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.artifacts\[0\]\.bucketName/);
      });

      it('rejects an artifact-level region', async () => {
        writeConfig(CONFIG_FILENAME, { registry, type: 'package', name: 'n', artifacts: [{ source: 's', objectName: 'o.zip', region: 'eu-west-1' }] });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.artifacts\[0\]\.region/);
      });
    });

    describe('target consistency', () => {
      it('rejects two artifacts of one package published to different regions, naming both objectNames', async () => {
        writeConfig(CONFIG_FILENAME, {
          registry,
          type: 'package',
          name: 'n',
          artifacts: [
            { source: 's', objectName: 'first.zip' },
            { source: 's', objectName: 'second.zip', regions: ['eu-central-1'] },
          ],
        });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: artifacts 'first\.zip'.*and 'second\.zip'.*package 'n'/);
      });

      it('accepts artifacts of different packages published to different regions', async () => {
        writeConfig(CONFIG_FILENAME, {
          registry,
          type: 'package',
          name: 'n',
          artifacts: [
            { source: 's', objectName: 'first.zip' },
            { source: 's', objectName: 'second.zip', name: 'other', zone: 'edge' },
          ],
        });

        await expect(loadWorkspaceConfig(dir)).resolves.toBeDefined();
      });

      it('rejects a bucket override for a region no artifact is published to', async () => {
        writeConfig(CONFIG_FILENAME, {
          registry: { ...registry, bucketOverrides: { 'eu-central-1': 'example-artifacts-other' } },
          type: 'package',
          name: 'n',
          artifacts: [{ source: 's', objectName: 'o.zip' }],
        });

        await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: registry\.bucketOverrides names region 'eu-central-1'/);
      });

      it('accepts a bucket override for the region of an edge artifact', async () => {
        writeConfig(CONFIG_FILENAME, {
          registry: { ...registry, bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' } },
          type: 'package',
          name: 'n',
          artifacts: [{ source: 's', objectName: 'o.zip', zone: 'edge' }],
        });

        await expect(loadWorkspaceConfig(dir)).resolves.toBeDefined();
      });
    });
  });

  describe('buildArtifacts', () => {
    it('rejects an artifact-registry.json entry without a source', async () => {
      writeConfig(CONFIG_FILENAME, { registry, type: 'package', name: 'n', artifacts: [{ objectName: 'o.zip' }] });

      await expect(buildArtifacts(dir, path.join(dir, 'out'))).rejects.toThrow(/artifact-registry\.json: \.artifacts\[0\]\.source/);
    });
  });
});
