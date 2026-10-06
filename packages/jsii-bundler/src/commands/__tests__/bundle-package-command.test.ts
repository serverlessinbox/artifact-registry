import { Cli } from 'clipanion';
import { writeFile } from 'fs/promises';
import { join, relative } from 'path';

import { createFixtureFolder, removeFixtureFolder } from '../../__tests__/package-fixture';
import { bundleJsiiPackage } from '../../jsii-package/bundle-jsii-package';
import { BundlePackageCommand } from '../bundle-package-command';

jest.mock('../../jsii-package/bundle-jsii-package');

const bundleJsiiPackageMock = jest.mocked(bundleJsiiPackage);

/**
 * Pins how `jsii-bundler package` resolves its inputs: the folder argument is relative to the
 * current directory, the jsii excludes come from that folder's package.json (none when it has no
 * jsii section), and an unreadable or malformed package.json rejects the command before anything
 * is bundled. The bundling itself is faked; it has its own suite.
 */
describe('BundlePackageCommand', () => {
  let folder: string;

  beforeEach(async () => {
    bundleJsiiPackageMock.mockReset();
    bundleJsiiPackageMock.mockResolvedValue();
    folder = await createFixtureFolder([]);
  });

  afterEach(async () => {
    await removeFixtureFolder(folder);
  });

  async function execute(packageJsonContent: string): Promise<void> {
    await writeFile(join(folder, 'package.json'), packageJsonContent);
    const cli = Cli.from([BundlePackageCommand]);
    const input = ['package', relative(process.cwd(), folder)];
    await cli.process({ input, context: Cli.defaultContext }).execute();
  }

  it('bundles the folder with the excludeTypescript paths of its package.json', async () => {
    await execute(JSON.stringify({ jsii: { excludeTypescript: ['src/a.ts', 'src/b.ts'] } }));

    expect(bundleJsiiPackageMock).toHaveBeenCalledWith(folder, ['src/a.ts', 'src/b.ts']);
  });

  it('bundles with no excludes when package.json has no jsii section', async () => {
    await execute(JSON.stringify({ name: 'x' }));

    expect(bundleJsiiPackageMock).toHaveBeenCalledWith(folder, []);
  });

  it('rejects without bundling when package.json is malformed', async () => {
    await expect(execute('{ not json')).rejects.toThrow(join(folder, 'package.json'));

    expect(bundleJsiiPackageMock).not.toHaveBeenCalled();
  });
});
