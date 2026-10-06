import { build } from 'esbuild';

import {
  createFixtureFolder,
  fixturePackageJson,
  jsiiDependencyFiles,
  plainDependencyFiles,
  removeFixtureFolder,
} from '../../../__tests__/package-fixture';
import { jsiiIgnorePlugin } from '../jsii-ignore';

/**
 * Pins which imports the bundler keeps external: a package is a jsii package only when a `.jsii`
 * file sits at its root, and a deep import is judged by that root. Bundling a jsii dependency
 * inline would give the construct library its own copy of types that must be shared with the
 * consumer, so a regression here breaks jsii type identity without any build error.
 */
describe('jsiiIgnorePlugin', () => {
  const folders: string[] = [];

  afterEach(async () => {
    await Promise.all(folders.splice(0).map(removeFixtureFolder));
  });

  async function bundleEntry(entrySource: string): Promise<string> {
    const folder = await createFixtureFolder([
      fixturePackageJson,
      { path: 'src/index.ts', content: entrySource },
      ...jsiiDependencyFiles,
      ...plainDependencyFiles,
    ]);
    folders.push(folder);
    const result = await build({
      entryPoints: [`${folder}/src/index.ts`],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      outdir: `${folder}/out`,
      logLevel: 'silent',
      plugins: [jsiiIgnorePlugin(folder)],
    });
    return result.outputFiles[0].text;
  }

  it('leaves an import of a package with a .jsii at its root external', async () => {
    const output = await bundleEntry('import { jsiiMarker } from "jsii-dep"; export const x = jsiiMarker;');

    expect(output).toContain('require("jsii-dep")');
    expect(output).not.toContain('JSII_DEP_MARKER');
  });

  it('inlines an import of a package without a .jsii', async () => {
    const output = await bundleEntry('import { plainMarker } from "plain-dep"; export const x = plainMarker;');

    expect(output).toContain('PLAIN_DEP_MARKER');
    expect(output).not.toContain('require("plain-dep")');
  });

  it('leaves a deep import external when the package root is a jsii package', async () => {
    const output = await bundleEntry('import { deepMarker } from "jsii-dep/sub/file"; export const x = deepMarker;');

    expect(output).toContain('require("jsii-dep/sub/file")');
    expect(output).not.toContain('JSII_DEEP_MARKER');
  });

  it('inlines a deep import when the package root is not a jsii package', async () => {
    const output = await bundleEntry('import { plainMarker } from "plain-dep/index.js"; export const x = plainMarker;');

    expect(output).toContain('PLAIN_DEP_MARKER');
  });

  it('only judges import statements, so a require call of a jsii package is inlined', async () => {
    const output = await bundleEntry('export const x = require("jsii-dep").jsiiMarker;');

    expect(output).toContain('JSII_DEP_MARKER');
  });
});
