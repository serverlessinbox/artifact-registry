import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { zipDirectory, zipFile } from '../utils/zip';
import { hasErrorCode } from '../utils/error-code';
import { loadWorkspaceConfig } from './workspace-config';
import type { S3ArtifactEntry, S3WorkspaceConfig } from './workspace-config';
import type { ArtifactBuildResult, ArtifactRouting } from './artifact';

/** An artifact file written to the output folder, with where it is published. */
interface BuiltEntry {
  basename: string;
  routing: ArtifactRouting;
}

async function bundleJsZip(entryPoint: string, outZip: string): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'artifact-tools-bundle-'));
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
    await zipFile(outJs, outZip);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

async function buildEntry(
  entry: S3ArtifactEntry,
  workspaceCwd: string,
  outputFolder: string,
  config: S3WorkspaceConfig,
): Promise<BuiltEntry> {
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
      isDirectory = (await fs.stat(resolved)).isDirectory();
    } catch {
      throw new Error(`[s3-artifact] Source not found: ${resolved}`);
    }

    if (isDirectory) {
      await zipDirectory(resolved, outPath);
    } else {
      await fs.copyFile(resolved, outPath);
    }
  }

  return {
    basename: outputBasename,
    routing: {
      package: {
        bucketName: entry.bucketName ?? config.bucketName,
        artifactType: config.type,
        name: entry.name ?? config.name,
      },
      region: entry.region,
      objectName: entry.objectName,
    },
  };
}

/**
 * Builds every artifact of a workspace into `outputFolder`: a `js-zip` entry is bundled with esbuild,
 * a directory is zipped, and a file is copied. The config comes from `configOverride` or, when that
 * is absent, from `artifact-registry.json` in `workspaceCwd`; a workspace without that file yields no outputs.
 */
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
      config = await loadWorkspaceConfig(workspaceCwd);
    } catch (err: unknown) {
      if (hasErrorCode(err, 'ENOENT')) {
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

  const routingMap = new Map<string, ArtifactRouting>();
  const outputFiles: string[] = [];

  for (const result of results) {
    outputFiles.push(result.basename);
    routingMap.set(result.basename, result.routing);
  }

  return { outputFiles, routingMap };
}
