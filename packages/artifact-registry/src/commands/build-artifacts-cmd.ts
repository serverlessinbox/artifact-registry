import { Command, Option } from 'clipanion';
import * as path from 'path';
import { buildArtifacts } from '../artifacts/build-artifacts';

/** CLI command that builds artifacts defined in artifact-registry.json and writes them to the output folder. */
export class BuildArtifactsCommand extends Command {
  static override paths = [['build']];

  static override usage = Command.Usage({
    description: 'Build artifacts defined in artifact-registry.json and place them in the output folder.',
    examples: [
      ['Build artifacts in current directory', '$0 build --output dist/artifacts'],
      ['Build artifacts from a specific workspace', '$0 build --cwd packages/app --output dist/artifacts'],
    ],
  });

  cwd = Option.String('--cwd', {
    description: 'Workspace directory containing artifact-registry.json. Defaults to process.cwd().',
  });

  output = Option.String('--output', {
    required: true,
    description: 'Output folder for built artifacts.',
  });

  async execute(): Promise<number> {
    const workspaceCwd = this.cwd ?? process.cwd();
    const outputFolder = path.isAbsolute(this.output)
      ? this.output
      : path.join(process.cwd(), this.output);

    const result = await buildArtifacts(workspaceCwd, outputFolder);

    if (result.outputFiles.length === 0) {
      this.context.stdout.write(`No artifacts found (no artifact-registry.json in ${workspaceCwd})\n`);
    } else {
      for (const file of result.outputFiles) {
        this.context.stdout.write(`${file}\n`);
      }
    }

    return 0;
  }
}
