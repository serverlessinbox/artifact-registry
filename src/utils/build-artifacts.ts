import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { run } from './common';
import type { ArtifactType, S3ArtifactEntry, S3WorkspaceConfig, ArtifactBuildResult } from './types';

async function bundleJsZip(entryPoint: string, outZip: string): Promise<void> {
  const tmpDir = fssync.mkdtempSync(path.join(os.tmpdir(), 'artifact-tools-bundle-'));
  try {
    const outJs = path.join(tmpDir, 'index.js');

    await esbuild.build({
      entryPoints: [entryPoint],
      outfile: outJs,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      bundle: true,
      sourcemap: false,
      minify: true,
      external: ['aws-sdk'],
    });

    // Zip contains a single file `index.js` at the archive root.
    // `-j` strips directory paths, ensuring the root layout.
    run('zip', ['-j', outZip, outJs]);
  } finally {
    fssync.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function buildEntry(
  entry: S3ArtifactEntry,
  workspaceCwd: string,
  outputFolder: string,
  config: S3WorkspaceConfig,
): Promise<{ basename: string; routing: { bucketName: string; artifactType: ArtifactType; name: string; region?: string; objectName: string } }> {
  const resolved = path.isAbsolute(entry.source)
    ? entry.source
    : path.join(workspaceCwd, entry.source);

  const outputBasename = path.basename(entry.objectName);
  const outPath = path.join(outputFolder, outputBasename);

  if (entry.bundleType === 'js-zip') {
    await bundleJsZip(resolved, outPath);
  } else {
    let isDirectory = false;
    try {
      isDirectory = fssync.statSync(resolved).isDirectory();
    } catch {
      throw new Error(`[s3-artifact] Source not found: ${resolved}`);
    }

    if (isDirectory) {
      run('zip', ['-j', '-r', outPath, resolved]);
    } else {
      await fs.copyFile(resolved, outPath);
    }
  }

  return {
    basename: outputBasename,
    routing: {
      bucketName: entry.bucketName ?? config.bucketName,
      artifactType: config.type,
      name: entry.name ?? config.name,
      region: entry.region,
      objectName: entry.objectName,
    },
  };
}

export async function buildArtifacts(
  workspaceCwd: string,
  outputFolder: string,
  configOverride?: S3WorkspaceConfig,
): Promise<ArtifactBuildResult> {
  const empty: ArtifactBuildResult = { outputFiles: [], routingMap: new Map() };

  let config: S3WorkspaceConfig;

  if (configOverride !== undefined) {
    config = configOverride;
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require(path.join(workspaceCwd, 'artifacts.cjs')) as S3WorkspaceConfig;
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'MODULE_NOT_FOUND') {
        return empty;
      }
      throw err;
    }
  }

  if (!Array.isArray(config.artifacts)) {
    return empty;
  }

  const results = await Promise.all(
    config.artifacts.map(entry => buildEntry(entry, workspaceCwd, outputFolder, config)),
  );

  const routingMap = new Map<string, { bucketName: string; artifactType: ArtifactType; name: string; region?: string; objectName: string }>();
  const outputFiles: string[] = [];

  for (const result of results) {
    outputFiles.push(result.basename);
    routingMap.set(result.basename, result.routing);
  }

  return { outputFiles, routingMap };
}
