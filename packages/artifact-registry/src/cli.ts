import * as path from 'path';
import { Builtins, Cli } from 'clipanion';
import { BuildArtifactsCommand } from './commands/build-artifacts-cmd';
import { PublishChannelCommand } from './commands/publish-channel-cmd';
import { PublishReleaseCommand } from './commands/publish-release-cmd';
import { ResolveArtifactsCommand } from './commands/resolve-artifacts-cmd';
import { FetchRegistryRecordCommand } from './commands/fetch-registry-record-cmd';
import { CheckRegistryRecordCommand } from './commands/check-registry-record-cmd';
import { readPackageVersion } from './utils/package-json';

export async function runCli(argv: string[]) {
  const binaryVersion = await readPackageVersion(path.join(__dirname, '..', 'package.json'));
  const cli = new Cli({
    binaryLabel: 'artifact-registry',
    binaryName: 'artifact-registry',
    binaryVersion,
  });

  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  cli.register(BuildArtifactsCommand);
  cli.register(PublishChannelCommand);
  cli.register(PublishReleaseCommand);
  cli.register(ResolveArtifactsCommand);
  cli.register(FetchRegistryRecordCommand);
  cli.register(CheckRegistryRecordCommand);

  // Yarn scripts may inject a standalone `--` when forwarding args.
  const normalizedArgv = argv.filter((a) => a !== '--');
  await cli.runExit(normalizedArgv, Cli.defaultContext);
}
