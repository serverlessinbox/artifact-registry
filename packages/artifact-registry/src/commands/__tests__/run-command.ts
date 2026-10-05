import { Cli } from 'clipanion';
import type { CommandClass } from 'clipanion';
import { Writable } from 'stream';

export interface CommandRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function collector(chunks: string[]): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
}

/** Runs one real clipanion command class through the real parser and returns its exit code and output. */
export async function runCommand(command: CommandClass, argv: string[]): Promise<CommandRun> {
  const cli = Cli.from([command]);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await cli.run(argv, { stdout: collector(stdout), stderr: collector(stderr) });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}
