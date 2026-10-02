import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArtifacts } from '../build-artifacts';
import { CONFIG_FILENAME, loadWorkspaceConfig } from '../workspace-config';

/**
 * Config modules are loaded with `require()`, so their content is untyped at runtime. Pins that
 * `loadWorkspaceConfig` and `buildArtifacts` reject a malformed config with an error naming the
 * file and the field, instead of failing later as an undefined access.
 */
describe('require()d workspace configs are validated', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-validation-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeConfig(fileName: string, config: unknown): void {
    fs.writeFileSync(path.join(dir, fileName), `module.exports = ${JSON.stringify(config)};`);
  }

  describe('loadWorkspaceConfig', () => {
    it('rejects a config whose artifacts is not an array', () => {
      writeConfig(CONFIG_FILENAME, { bucketName: 'b', type: 'package', name: 'n', artifacts: 'nope' });

      expect(() => loadWorkspaceConfig(dir)).toThrow(/artifact-registry\.cjs.*artifacts/);
    });

    it('rejects a config whose type is unknown', () => {
      writeConfig(CONFIG_FILENAME, { bucketName: 'b', type: 'bogus', name: 'n', artifacts: [] });

      expect(() => loadWorkspaceConfig(dir)).toThrow(/artifact-registry\.cjs.*type/);
    });

    it('returns a well-formed config', () => {
      const config = { bucketName: 'b', type: 'package', name: 'n', artifacts: [{ source: 's', objectName: 'o.zip' }] };
      writeConfig(CONFIG_FILENAME, config);

      expect(loadWorkspaceConfig(dir)).toEqual(config);
    });
  });

  describe('buildArtifacts', () => {
    it('rejects an artifacts.cjs entry without a source', async () => {
      writeConfig('artifacts.cjs', { bucketName: 'b', type: 'package', name: 'n', artifacts: [{ objectName: 'o.zip' }] });

      await expect(buildArtifacts(dir, path.join(dir, 'out'))).rejects.toThrow(/artifacts\.cjs.*source/);
    });
  });
});
