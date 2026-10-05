import { Command, Option } from 'clipanion';
import * as path from 'path';
import { buildArtifacts } from '../artifacts/build-artifacts';

export class BuildArtifactsCommand extends Command {
  static override paths = [['build']];

  static override usage = Command.Usage({
    description: 'Build artifacts defined in artifacts.json and place them in the output folder.',
    examples: [
      ['Build artifacts in current directory', '$0 build'],
      ['Build artifacts from a specific workspace', '$0 build --cwd packages/mailbox --output dist/artifacts'],
    ],
  });

  cwd = Option.String('--cwd', {
    description: 'Workspace directory containing artifacts.json. Defaults to process.cwd().',
  });

  output = Option.String('--output', {
    description: 'Output folder for built artifacts. Defaults to gitversion.out/artifacts.',
  });

  async execute(): Promise<number> {
    const workspaceCwd = this.cwd ?? process.cwd();
    const outputFolder = this.output
      ? path.isAbsolute(this.output)
        ? this.output
        : path.join(process.cwd(), this.output)
      : path.join(process.cwd(), 'gitversion.out', 'artifacts');

    const result = await buildArtifacts(workspaceCwd, outputFolder);

    if (result.outputFiles.length === 0) {
      this.context.stdout.write(`No artifacts found (no artifacts.json in ${workspaceCwd})\n`);
    } else {
      for (const file of result.outputFiles) {
        this.context.stdout.write(`${file}\n`);
      }
    }

    return 0;
  }
}
