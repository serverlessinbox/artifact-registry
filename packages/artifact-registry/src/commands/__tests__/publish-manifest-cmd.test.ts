import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PublishManifestCommand } from '../publish-manifest-cmd';
import { runCommand } from './run-command';

/**
 * Pins that `publish manifest` fails with a non-zero exit code, naming the offending option or
 * file, for an unknown `--type` and for a malformed versions file or package.json. Each case stops
 * before any S3 call, so no manifest is published from bad input.
 */
describe('PublishManifestCommand rejects malformed input', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function writeJson(name: string, content: unknown): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  }

  function args(overrides: string[]): string[] {
    return ['publish', 'manifest', '--bucket', 'b', '--name', 'n', ...overrides];
  }

  it('rejects an unknown --type before doing any work', async () => {
    const versionsFile = writeJson('versions.json', { a: '1.0.0' });

    const run = await runCommand(PublishManifestCommand, args(['--type', 'bogus', '--version', '1.0.0', '--versions-file', versionsFile]));

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('--type');
  });

  it('rejects a versions file whose values are not strings', async () => {
    const versionsFile = writeJson('versions.json', { a: 1 });

    const run = await runCommand(PublishManifestCommand, args(['--type', 'package', '--version', '1.0.0', '--versions-file', versionsFile]));

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('versions.json');
  });

  it('rejects a package.json whose version is not a string', async () => {
    const versionsFile = writeJson('versions.json', { a: '1.0.0' });
    const pkgFile = writeJson('package.json', { version: 5 });

    const run = await runCommand(PublishManifestCommand, args(['--type', 'package', '--version-from-package', pkgFile, '--versions-file', versionsFile]));

    expect(run.exitCode).not.toBe(0);
    expect(run.stdout + run.stderr).toContain('package.json');
  });
});
