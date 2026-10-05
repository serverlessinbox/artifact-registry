import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { CONFIG_FILENAME } from '../workspace-config';
import { buildArtifacts } from '../build-artifacts';
import type { S3WorkspaceConfig } from '../workspace-config';

/**
 * Pins that a directory artifact is zipped with its folder structure intact (a flattened archive
 * would let same-named files in different folders overwrite each other on extraction), and that each
 * built file's routing carries the project and every region bucket it is published to, resolved at
 * build time so publishers need no config lookup.
 */
describe('buildArtifacts', () => {
  let dir: string;
  let outputFolder: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-artifacts-'));
    outputFolder = path.join(dir, 'out');
    fs.mkdirSync(outputFolder);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps nested paths in the produced zip', async () => {
    fs.mkdirSync(path.join(dir, 'templates', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'templates', 'top.yaml'), 'top');
    fs.writeFileSync(path.join(dir, 'templates', 'sub', 'inner.yaml'), 'inner');
    const config: S3WorkspaceConfig = {
      registry: { bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] },
      type: 'package',
      name: 'n',
      artifacts: [{ source: 'templates', objectName: 'templates.zip' }],
    };

    const result = await buildArtifacts(dir, outputFolder, config);

    expect(result.outputFiles).toEqual(['templates.zip']);
    const entries = unzipSync(fs.readFileSync(path.join(outputFolder, 'templates.zip')));
    expect(Object.keys(entries).sort()).toEqual(['sub/inner.yaml', 'top.yaml']);
  });

  it('routes each file to the project and the region buckets its entry resolves to', async () => {
    fs.writeFileSync(path.join(dir, 'regional.zip'), 'regional');
    fs.writeFileSync(path.join(dir, 'edge.zip'), 'edge');
    const config: S3WorkspaceConfig = {
      registry: {
        bucketBase: 'example-artifacts',
        project: 'example',
        regions: ['eu-west-1', 'eu-central-1'],
        bucketOverrides: { 'us-east-1': 'example-artifacts-use1-7f3a' },
      },
      type: 'package',
      name: 'n',
      artifacts: [
        { source: 'regional.zip', objectName: 'lambdas/regional.zip' },
        { source: 'edge.zip', objectName: 'edge.zip', name: 'n-edge', zone: 'edge' },
      ],
    };

    const result = await buildArtifacts(dir, outputFolder, config);

    expect(result.routingMap.get('regional.zip')).toEqual({
      package: { project: 'example', artifactType: 'package', name: 'n' },
      objectName: 'lambdas/regional.zip',
      targets: [
        { region: 'eu-west-1', bucketName: 'example-artifacts-eu-west-1' },
        { region: 'eu-central-1', bucketName: 'example-artifacts-eu-central-1' },
      ],
    });
    expect(result.routingMap.get('edge.zip')).toEqual({
      package: { project: 'example', artifactType: 'package', name: 'n-edge' },
      objectName: 'edge.zip',
      targets: [{ region: 'us-east-1', bucketName: 'example-artifacts-use1-7f3a' }],
    });
  });

  it('rejects an artifact-registry.json entry without a source', async () => {
    const registry = { bucketBase: 'example-artifacts', project: 'example', regions: ['eu-west-1'] };
    fs.writeFileSync(path.join(dir, CONFIG_FILENAME), JSON.stringify({ registry, type: 'package', name: 'n', artifacts: [{ objectName: 'o.zip' }] }));

    await expect(buildArtifacts(dir, outputFolder)).rejects.toThrow(/artifact-registry\.json: \.artifacts\[0\]\.source/);
  });
});
