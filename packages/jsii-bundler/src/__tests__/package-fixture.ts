import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/** One file of a fixture folder: its path relative to the folder, and its text content. */
export interface FixtureFile {
  readonly path: string;
  readonly content: string;
}

/**
 * Creates a temp folder holding the given files and returns its real path. The real path matters:
 * esbuild reports importers by real path, and a symlinked tmpdir (macOS `/var`) would otherwise
 * never match the package folder the plugins compare against.
 */
export async function createFixtureFolder(files: FixtureFile[]): Promise<string> {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'jsii-bundler-test-')));
  for (const file of files) {
    const target = join(folder, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
  return folder;
}

/** Removes a folder made by `createFixtureFolder`. */
export async function removeFixtureFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true });
}

/** An installed dependency that carries the `.jsii` assembly file, with a deep module under `sub/`. */
export const jsiiDependencyFiles: FixtureFile[] = [
  { path: 'node_modules/jsii-dep/package.json', content: '{"name":"jsii-dep","version":"1.0.0","main":"index.js"}' },
  { path: 'node_modules/jsii-dep/.jsii', content: '{}' },
  { path: 'node_modules/jsii-dep/index.js', content: 'exports.jsiiMarker = "JSII_DEP_MARKER";' },
  { path: 'node_modules/jsii-dep/sub/file.js', content: 'exports.deepMarker = "JSII_DEEP_MARKER";' },
];

/** An installed dependency without a `.jsii` file, so the bundler is expected to inline it. */
export const plainDependencyFiles: FixtureFile[] = [
  { path: 'node_modules/plain-dep/package.json', content: '{"name":"plain-dep","version":"1.0.0","main":"index.js"}' },
  { path: 'node_modules/plain-dep/index.js', content: 'exports.plainMarker = "PLAIN_DEP_MARKER";' },
];

/** The fixture package's own package.json; its `main` is the file the plugin resolves lookups from. */
export const fixturePackageJson: FixtureFile = {
  path: 'package.json',
  content: '{"name":"fixture-pkg","version":"1.0.0","main":"src/index.ts"}',
};
