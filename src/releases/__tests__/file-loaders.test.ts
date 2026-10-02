import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readComponentVersions } from '../component-versions';
import { readPackageJson } from '../../utils/package-json';

/**
 * Pins that `readPackageJson` and `readComponentVersions` return a valid document and reject a
 * malformed one with an error naming the file and the field, rather than yielding a non-string
 * version that would be published.
 */
describe('file loaders return the validated document and reject malformed input by field', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-loaders-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeJson(name: string, content: unknown): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  }

  describe('readPackageJson', () => {
    it('returns the version of a package.json', () => {
      const packageJson = readPackageJson(writeJson('package.json', { name: 'n', version: '1.2.3' }));

      expect(packageJson.version).toBe('1.2.3');
    });

    it('rejects a non-string version, naming the file and the field', () => {
      const file = writeJson('package.json', { version: 5 });

      expect(() => readPackageJson(file)).toThrow(new RegExp(`${file}: \\.version`));
    });

    it('rejects a package.json without a version, naming the file and the field', () => {
      const file = writeJson('package.json', { name: 'n' });

      expect(() => readPackageJson(file)).toThrow(new RegExp(`${file}: \\.version`));
    });
  });

  describe('readComponentVersions', () => {
    it('returns the component to version map', () => {
      expect(readComponentVersions(writeJson('versions.json', { a: '1.0.0', b: '2.0.0' }))).toEqual({ a: '1.0.0', b: '2.0.0' });
    });

    it('rejects a non-string version, naming the file and the component', () => {
      const file = writeJson('versions.json', { a: 1 });

      expect(() => readComponentVersions(file)).toThrow(new RegExp(`${file}: \\.a`));
    });
  });
});
