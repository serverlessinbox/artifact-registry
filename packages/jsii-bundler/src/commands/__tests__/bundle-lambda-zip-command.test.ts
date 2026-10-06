import { Cli } from 'clipanion';
import { resolve } from 'path';

import { bundleLambdaZip } from '../../lambda-zip/bundle-lambda-zip';
import { BundleLambdaZipCommand } from '../bundle-lambda-zip-command';

jest.mock('../../lambda-zip/bundle-lambda-zip');

const bundleLambdaZipMock = jest.mocked(bundleLambdaZip);

/**
 * Pins how `jsii-bundler lambda-zip` turns its flags into a bundle request: paths are resolved
 * against the current directory, `--external` is a comma-separated list that defaults to the
 * AWS SDK the Lambda runtime provides, and a failing bundle rejects the command. The bundling
 * itself is faked; it has its own suite.
 */
describe('BundleLambdaZipCommand', () => {
  beforeEach(() => {
    bundleLambdaZipMock.mockReset();
    bundleLambdaZipMock.mockResolvedValue();
  });

  async function execute(...args: string[]): Promise<void> {
    const cli = Cli.from([BundleLambdaZipCommand]);
    await cli.process({ input: ['lambda-zip', ...args], context: Cli.defaultContext }).execute();
  }

  it('passes resolved paths and the defaults for target, minify and externals', async () => {
    await execute('--entry', 'src/handler.ts', '--out', 'out/handler.zip');

    expect(bundleLambdaZipMock).toHaveBeenCalledWith({
      entryPath: resolve('src/handler.ts'),
      outZip: resolve('out/handler.zip'),
      target: 'node24',
      minify: true,
      externals: ['@aws-sdk/*'],
    });
  });

  it('splits --external on commas, trimming blanks and dropping empty entries', async () => {
    await execute('--entry', 'a.ts', '--out', 'a.zip', '--external', ' pkg-a, pkg-b/* ,,pkg-c');

    expect(bundleLambdaZipMock.mock.calls[0][0].externals).toEqual(['pkg-a', 'pkg-b/*', 'pkg-c']);
  });

  it('turns minification off with --no-minify', async () => {
    await execute('--entry', 'a.ts', '--out', 'a.zip', '--no-minify');

    expect(bundleLambdaZipMock.mock.calls[0][0].minify).toBe(false);
  });

  it('rejects when bundling fails', async () => {
    bundleLambdaZipMock.mockRejectedValue(new Error('zip exited with code 3'));

    await expect(execute('--entry', 'a.ts', '--out', 'a.zip')).rejects.toThrow('zip exited with code 3');
  });
});
