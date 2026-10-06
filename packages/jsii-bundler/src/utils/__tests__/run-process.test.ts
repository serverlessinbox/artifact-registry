import { realpath } from 'fs/promises';
import { tmpdir } from 'os';

import { runWithInheritedStdio } from '../run-process';

/**
 * Pins the contract callers of `runWithInheritedStdio` build on: a non-zero exit is a resolved
 * code for the caller to judge, while a binary that cannot be started is a rejection. If a failing
 * exit rejected, the declaration emit (which tolerates a failing `tsc`) would fail the bundle.
 */
describe('runWithInheritedStdio', () => {
  it('resolves with the exit code of the process', async () => {
    await expect(runWithInheritedStdio(process.execPath, ['-e', 'process.exit(0)'])).resolves.toBe(0);
  });

  it('resolves, not rejects, with a non-zero exit code', async () => {
    await expect(runWithInheritedStdio(process.execPath, ['-e', 'process.exit(3)'])).resolves.toBe(3);
  });

  it('runs the process in the given working directory', async () => {
    const otherFolder = await realpath(tmpdir());
    const script = `process.exit(process.cwd() === ${JSON.stringify(otherFolder)} ? 0 : 5)`;

    await expect(runWithInheritedStdio(process.execPath, ['-e', script], otherFolder)).resolves.toBe(0);
  });

  it('rejects when the binary cannot be started', async () => {
    await expect(runWithInheritedStdio('jsii-bundler-no-such-binary', [])).rejects.toThrow('ENOENT');
  });
});
