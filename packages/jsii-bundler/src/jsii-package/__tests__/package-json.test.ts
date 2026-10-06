import { writeFile } from 'fs/promises';
import { join } from 'path';

import { createFixtureFolder, removeFixtureFolder } from '../../__tests__/package-fixture';
import { readPackageJson } from '../package-json';

/**
 * Pins what the bundler reads from a package.json and how it fails: a package without a `jsii`
 * section has no excludes, and a malformed document must reject naming its path, because the
 * bundler would otherwise emit TypeScript that jsii deliberately excludes.
 */
describe('readPackageJson', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await createFixtureFolder([]);
  });

  afterEach(async () => {
    await removeFixtureFolder(folder);
  });

  async function writePackageJson(content: string): Promise<string> {
    const path = join(folder, 'package.json');
    await writeFile(path, content);
    return path;
  }

  it('returns the jsii excludes of a valid file and ignores its other fields', async () => {
    await writePackageJson(JSON.stringify({ name: 'x', jsii: { excludeTypescript: ['src/a.ts'], outdir: 'dist' } }));

    const packageJson = await readPackageJson(folder);

    expect(packageJson.jsii?.excludeTypescript).toEqual(['src/a.ts']);
  });

  it('returns no jsii section when the file has none', async () => {
    await writePackageJson(JSON.stringify({ name: 'x' }));

    const packageJson = await readPackageJson(folder);

    expect(packageJson.jsii).toBeUndefined();
  });

  it('rejects, naming the file path, when excludeTypescript is not a list of strings', async () => {
    const path = await writePackageJson(JSON.stringify({ jsii: { excludeTypescript: 'src/a.ts' } }));

    await expect(readPackageJson(folder)).rejects.toThrow(`${path} has an unexpected shape`);
  });

  it('rejects, naming the file path, when the file is not valid JSON', async () => {
    const path = await writePackageJson('{ not json');

    await expect(readPackageJson(folder)).rejects.toThrow(`${path} is not valid JSON`);
  });
});
