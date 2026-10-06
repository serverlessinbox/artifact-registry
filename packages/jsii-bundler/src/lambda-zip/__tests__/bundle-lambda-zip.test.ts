import { execFile } from 'child_process';
import { chmod, mkdir } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

import { createFixtureFolder, removeFixtureFolder } from '../../__tests__/package-fixture';
import { bundleLambdaZip, LambdaZipSpec } from '../bundle-lambda-zip';

const run = promisify(execFile);

/**
 * Pins what a Lambda deployment package contains: the zip holds exactly one `index.js` with no
 * directory entries (the Lambda runtime loads `index.handler` from the zip root), the entry's
 * dependencies are inlined except the configured externals, and a failing `zip` or esbuild
 * rejects instead of leaving a stale artifact looking like a fresh build. Uses the real esbuild
 * and the system `zip` and `unzip` binaries.
 */
describe('bundleLambdaZip', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await createFixtureFolder([
      { path: 'src/handler.ts', content: 'import { greeting } from "./greeting"; export const handler = () => greeting;' },
      { path: 'src/greeting.ts', content: 'export const greeting = "GREETING_MARKER";' },
      { path: 'src/with-external.ts', content: 'import { x } from "@aws-sdk/client-s3"; export const handler = () => x;' },
    ]);
  });

  afterEach(async () => {
    await removeFixtureFolder(folder);
  });

  function specFor(entryFile: string, overrides: Partial<LambdaZipSpec> = {}): LambdaZipSpec {
    return {
      entryPath: join(folder, 'src', entryFile),
      outZip: join(folder, 'out', 'nested', 'handler.zip'),
      target: 'node20',
      minify: false,
      externals: [],
      ...overrides,
    };
  }

  async function zipEntries(zipPath: string): Promise<string[]> {
    const { stdout } = await run('unzip', ['-Z1', zipPath]);
    return stdout.split('\n').filter(Boolean);
  }

  async function zippedIndexJs(zipPath: string): Promise<string> {
    const { stdout } = await run('unzip', ['-p', zipPath, 'index.js']);
    return stdout;
  }

  it('writes a zip with exactly one index.js holding the inlined entry, creating the output folder', async () => {
    const spec = specFor('handler.ts');

    await bundleLambdaZip(spec);

    expect(await zipEntries(spec.outZip)).toEqual(['index.js']);
    expect(await zippedIndexJs(spec.outZip)).toContain('GREETING_MARKER');
  });

  it('replaces an existing zip instead of adding to it', async () => {
    const spec = specFor('handler.ts');
    await bundleLambdaZip(spec);
    await bundleLambdaZip(spec);

    expect(await zipEntries(spec.outZip)).toEqual(['index.js']);
  });

  it('keeps the configured externals out of the bundle', async () => {
    const spec = specFor('with-external.ts', { externals: ['@aws-sdk/*'] });

    await bundleLambdaZip(spec);

    expect(await zippedIndexJs(spec.outZip)).toContain('require("@aws-sdk/client-s3")');
  });

  it('rejects and writes no zip when esbuild fails', async () => {
    const spec = specFor('does-not-exist.ts');

    await expect(bundleLambdaZip(spec)).rejects.toThrow();
    await expect(run('unzip', ['-Z1', spec.outZip])).rejects.toThrow();
  });

  it('rejects, naming the exit code and the zip path, when zip exits non-zero', async () => {
    const readOnlyFolder = join(folder, 'read-only');
    await mkdir(readOnlyFolder);
    await chmod(readOnlyFolder, 0o555);
    const spec = specFor('handler.ts', { outZip: join(readOnlyFolder, 'handler.zip') });

    try {
      await expect(bundleLambdaZip(spec)).rejects.toThrow(
        new RegExp(`zip exited with code \\d+ while writing ${spec.outZip}`),
      );
    } finally {
      await chmod(readOnlyFolder, 0o755);
    }
  });
});
