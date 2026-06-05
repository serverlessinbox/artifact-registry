import { Builtins, Cli } from 'clipanion';
import { BundleJsZipCommand } from './commands/bundle-js-zip';
import { BuildArtifactsCommand } from './commands/build-artifacts-cmd';

export async function runCli(argv: string[]) {
  const cli = new Cli({
    binaryLabel: 'artifact-tools',
    binaryName: 'artifact-tools',
    binaryVersion: process.env.npm_package_version ?? '0.0.0-local',
  });

  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  cli.register(BundleJsZipCommand);
  cli.register(BuildArtifactsCommand);

  // Yarn scripts may inject a standalone `--` when forwarding args.
  const normalizedArgv = argv.filter((a) => a !== '--');
  await cli.runExit(normalizedArgv, Cli.defaultContext);
}
