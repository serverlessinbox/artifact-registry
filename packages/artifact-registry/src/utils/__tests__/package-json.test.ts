import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readPackageVersion } from '../package-json';

/**
 * Pins that readPackageVersion reads and validates the version field from a package.json file,
 * returning the version string on success and throwing an error naming the path on failure.
 */
describe('readPackageVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-json-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reads a valid package.json with version', async () => {
    const packageJsonPath = path.join(dir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ version: '1.2.3', name: 'test' }));

    const version = await readPackageVersion(packageJsonPath);
    expect(version).toBe('1.2.3');
  });

  it('throws an error naming the path when version is missing', async () => {
    const packageJsonPath = path.join(dir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'test' }));

    await expect(readPackageVersion(packageJsonPath)).rejects.toThrow(/package\.json.*\.version/);
  });

  it('throws an error naming the path when the file is not valid JSON', async () => {
    const packageJsonPath = path.join(dir, 'package.json');
    fs.writeFileSync(packageJsonPath, '{ not json');

    await expect(readPackageVersion(packageJsonPath)).rejects.toThrow(/package\.json is not valid JSON/);
  });
});
