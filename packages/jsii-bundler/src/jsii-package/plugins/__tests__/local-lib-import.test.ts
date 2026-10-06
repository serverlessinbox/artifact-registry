import { build } from 'esbuild';

import { createFixtureFolder, removeFixtureFolder } from '../../../__tests__/package-fixture';
import { localLibImportPlugin } from '../local-lib-import';

/**
 * Pins that a package's own relative imports stay external, so each source file remains its own
 * output module in `lib/`. If they were inlined, every entry file would duplicate its siblings
 * and module state shared between files would split in two.
 */
describe('localLibImportPlugin', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await createFixtureFolder([
      { path: 'src/index.ts', content: 'import { helperMarker } from "./helper"; export const x = helperMarker;' },
      { path: 'src/helper.ts', content: 'export const helperMarker = "HELPER_MARKER";' },
    ]);
  });

  afterEach(async () => {
    await removeFixtureFolder(folder);
  });

  it('leaves a relative import of the package external instead of inlining it', async () => {
    const result = await build({
      entryPoints: [`${folder}/src/index.ts`],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      outdir: `${folder}/out`,
      logLevel: 'silent',
      plugins: [localLibImportPlugin(folder)],
    });

    const output = result.outputFiles[0].text;
    expect(output).toContain('require("./helper")');
    expect(output).not.toContain('HELPER_MARKER');
  });

  it('inlines a relative import made by a file outside the package folder', async () => {
    const result = await build({
      entryPoints: [`${folder}/src/index.ts`],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      outdir: `${folder}/out`,
      logLevel: 'silent',
      plugins: [localLibImportPlugin(`${folder}/elsewhere`)],
    });

    expect(result.outputFiles[0].text).toContain('HELPER_MARKER');
  });
});
