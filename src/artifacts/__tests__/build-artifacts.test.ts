import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { buildArtifacts } from '../build-artifacts';
import type { S3WorkspaceConfig } from '../workspace-config';

/**
 * Pins that a directory artifact is zipped with its folder structure intact (a flattened archive
 * would let same-named files in different folders overwrite each other on extraction).
 */
describe('buildArtifacts directory entry', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps nested paths in the produced zip', async () => {
    fs.mkdirSync(path.join(dir, 'templates', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'templates', 'top.yaml'), 'top');
    fs.writeFileSync(path.join(dir, 'templates', 'sub', 'inner.yaml'), 'inner');
    const outputFolder = path.join(dir, 'out');
    fs.mkdirSync(outputFolder);
    const config: S3WorkspaceConfig = {
      bucketName: 'b',
      type: 'package',
      name: 'n',
      artifacts: [{ source: 'templates', objectName: 'templates.zip' }],
    };

    const result = await buildArtifacts(dir, outputFolder, config);

    expect(result.outputFiles).toEqual(['templates.zip']);
    const entries = unzipSync(fs.readFileSync(path.join(outputFolder, 'templates.zip')));
    expect(Object.keys(entries).sort()).toEqual(['sub/inner.yaml', 'top.yaml']);
  });
});
