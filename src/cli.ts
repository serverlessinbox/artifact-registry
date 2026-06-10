import { Builtins, Cli } from 'clipanion';
import { BundleJsZipCommand } from './commands/bundle-js-zip';
import { BuildArtifactsCommand } from './commands/build-artifacts-cmd';
import { PublishChannelCommand } from './commands/publish-channel-cmd';
import { PublishReleaseCommand } from './commands/publish-release-cmd';
import { CheckArtifactsCommand } from './commands/check-artifacts-cmd';

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
  cli.register(PublishChannelCommand);
  cli.register(PublishReleaseCommand);
  cli.register(CheckArtifactsCommand);

  // Yarn scripts may inject a standalone `--` when forwarding args.
  const normalizedArgv = argv.filter((a) => a !== '--');
  await cli.runExit(normalizedArgv, Cli.defaultContext);
}
