import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

import {
  createFixtureFolder,
  fixturePackageJson,
  jsiiDependencyFiles,
  plainDependencyFiles,
  removeFixtureFolder,
} from '../../__tests__/package-fixture';
import { bundleJsiiPackage } from '../bundle-jsii-package';

jest.mock('../../utils/run-process');

/**
 * Pins the shape of a bundled jsii package in `lib/`: plain dependencies are inlined, jsii
 * dependencies and the package's own relative imports stay `require` calls, and the paths in
 * jsii's `excludeTypescript` are never emitted. The declaration emit (a `yarn tsc` child process)
 * is faked, since spawning it is the volatile part and the bundle is judged on its output.
 */
describe('bundleJsiiPackage', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await createFixtureFolder([
      fixturePackageJson,
      {
        path: 'src/index.ts',
        content: [
          'import { jsiiMarker } from "jsii-dep";',
          'import { plainMarker } from "plain-dep";',
          'import { helperMarker } from "./helper";',
          'export const all = [jsiiMarker, plainMarker, helperMarker];',
        ].join('\n'),
      },
      { path: 'src/helper.ts', content: 'export const helperMarker = "HELPER_MARKER";' },
      { path: 'src/internal/excluded.ts', content: 'export const excludedMarker = "EXCLUDED_MARKER";' },
      ...jsiiDependencyFiles,
      ...plainDependencyFiles,
    ]);
  });

  afterEach(async () => {
    await removeFixtureFolder(folder);
  });

  it('inlines plain dependencies and keeps jsii dependencies and relative imports as requires', async () => {
    await bundleJsiiPackage(folder, []);

    const indexJs = await readFile(join(folder, 'lib/index.js'), 'utf-8');
    expect(indexJs).toContain('PLAIN_DEP_MARKER');
    expect(indexJs).toContain('require("jsii-dep")');
    expect(indexJs).not.toContain('JSII_DEP_MARKER');
    expect(indexJs).toContain('require("./helper")');
  });

  it('emits no output for the excludeTypescript paths', async () => {
    await bundleJsiiPackage(folder, ['src/internal/excluded.ts']);

    expect(await readdir(join(folder, 'lib'))).toEqual(['helper.js', 'index.js']);
  });

  it('emits the excluded file when no excludes are given', async () => {
    await bundleJsiiPackage(folder, []);

    expect(await readdir(join(folder, 'lib', 'internal'))).toEqual(['excluded.js']);
  });
});
