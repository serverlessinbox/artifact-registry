import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArtifacts } from '../build-artifacts';
import { CONFIG_FILENAME, loadWorkspaceConfig } from '../workspace-config';

/**
 * Config files are parsed JSON, so their content is untyped at runtime. Pins that
 * `loadWorkspaceConfig` and `buildArtifacts` reject a malformed config with an error naming the
 * file and the field, instead of failing later as an undefined access, and that a missing config
 * file surfaces as `ENOENT`, which the commands and the plugin treat as "no config".
 */
describe('workspace config files are validated', () => {
  let dir: string;

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
      writeConfig(CONFIG_FILENAME, { bucketName: 'b', type: 'package', name: 'n', artifacts: 'nope' });

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.artifacts/);
    });

    it('rejects a config whose type is unknown', async () => {
      writeConfig(CONFIG_FILENAME, { bucketName: 'b', type: 'bogus', name: 'n', artifacts: [] });

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json: \.type/);
    });

    it('returns a well-formed config', async () => {
      const config = { bucketName: 'b', type: 'package', name: 'n', artifacts: [{ source: 's', objectName: 'o.zip' }] };
      writeConfig(CONFIG_FILENAME, config);

      expect(await loadWorkspaceConfig(dir)).toEqual(config);
    });

    it('rejects a missing config file with the ENOENT code that callers skip on', async () => {
      await expect(loadWorkspaceConfig(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects a config file that is not valid JSON, naming the file', async () => {
      fs.writeFileSync(path.join(dir, CONFIG_FILENAME), '{ not json');

      await expect(loadWorkspaceConfig(dir)).rejects.toThrow(/artifact-registry\.json is not valid JSON/);
    });
  });

  describe('buildArtifacts', () => {
    it('rejects an artifact-registry.json entry without a source', async () => {
      writeConfig(CONFIG_FILENAME, { bucketName: 'b', type: 'package', name: 'n', artifacts: [{ objectName: 'o.zip' }] });

      await expect(buildArtifacts(dir, path.join(dir, 'out'))).rejects.toThrow(/artifact-registry\.json: \.artifacts\[0\]\.source/);
    });
  });
});
