import { BuildArtifactsCommand } from '../build-artifacts-cmd';
import { runCommand } from './run-command';

/**
 * Pins that `build` requires the `--output` flag. A missing required flag must fail with a
 * non-zero exit code, not silently use a default.
 */
describe('BuildArtifactsCommand', () => {
  it('fails when --output is not provided', async () => {
    const run = await runCommand(BuildArtifactsCommand, ['build']);

    expect(run.exitCode).not.toBe(0);
  });
});
