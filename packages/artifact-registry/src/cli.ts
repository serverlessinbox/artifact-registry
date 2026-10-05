import { Builtins, Cli } from 'clipanion';
import { BuildArtifactsCommand } from './commands/build-artifacts-cmd';
import { PublishChannelCommand } from './commands/publish-channel-cmd';
import { PublishReleaseCommand } from './commands/publish-release-cmd';
import { ResolveArtifactsCommand } from './commands/resolve-artifacts-cmd';

export async function runCli(argv: string[]) {
  const cli = new Cli({
    binaryLabel: 'artifact-tools',
    binaryName: 'artifact-tools',
    binaryVersion: process.env.npm_package_version ?? '0.0.0-local',
  });

  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  cli.register(BuildArtifactsCommand);
  cli.register(PublishChannelCommand);
  cli.register(PublishReleaseCommand);
  cli.register(ResolveArtifactsCommand);

  // Yarn scripts may inject a standalone `--` when forwarding args.
  const normalizedArgv = argv.filter((a) => a !== '--');
  await cli.runExit(normalizedArgv, Cli.defaultContext);
}
