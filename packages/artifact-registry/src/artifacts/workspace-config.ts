import { readFile } from 'fs/promises';
import * as path from 'path';
import * as t from 'typanion';
import { isArtifactType } from './artifact';
import { isArtifactZone, isRegionList, isRegistryConfig } from './registry-location';
import { resolveTargets } from './resolve-targets';

export const CONFIG_FILENAME = 'artifact-registry.json';

export const isS3ArtifactEntry = t.isObject({
  source: t.isString(),
  objectName: t.isString(),
  name: t.isOptional(t.isString()),
  zone: t.isOptional(isArtifactZone),
  regions: t.isOptional(isRegionList),
  bundleType: t.isOptional(t.isLiteral('js-zip')),
});

/**
 * One artifact of a workspace: `source` is a path to a file or directory (absolute or relative to
 * the workspace cwd), `objectName` the S3 object name of the output. `name` overrides the
 * workspace's package name. The destination regions are the entry's own `regions`, else the fixed
 * region of its `zone`, else the registry's regions; `bundleType: 'js-zip'` bundles a TS/JS
 * entrypoint via esbuild into a zip containing index.js.
 */
export type S3ArtifactEntry = t.InferType<typeof isS3ArtifactEntry>;

export const isS3WorkspaceConfig = t.isObject({
  registry: isRegistryConfig,
  type: isArtifactType,
  name: t.isString(),
  artifacts: t.isArray(isS3ArtifactEntry),
});

/**
 * A workspace's artifact configuration: the registry location and default regions, the artifact
 * type and name that form the S3 key prefix, and the artifacts to stage and publish.
 */
export type S3WorkspaceConfig = t.InferType<typeof isS3WorkspaceConfig>;

/** The first artifact seen for a package name, with the regions it is published to. */
interface PackageRegions {
  objectName: string;
  regions: string[];
}

/**
 * Loads and validates a workspace's JSON config file.
 * Throws the file system's own error (code ENOENT) when the file does not exist, an error naming
 * the file when it is not valid JSON, and a field-level error naming the file when the config is
 * malformed. Beyond the schema it rejects a config in which artifacts of one package name are
 * published to different regions (a region's pointer would name objects absent from it) and a
 * bucket override for a region no artifact is published to (a misspelled region would be ignored).
 */
export async function loadWorkspaceConfig(cwd: string, fileName: string = CONFIG_FILENAME): Promise<S3WorkspaceConfig> {
  const content = await readFile(path.join(cwd, fileName), 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    throw new Error(`${fileName} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const errors: string[] = [];
  if (!isS3WorkspaceConfig(parsed, { errors })) {
    throw new Error(`${fileName}: ${errors.join('; ')}`);
  }
  validateTargets(parsed, fileName);
  return parsed;
}

function validateTargets(config: S3WorkspaceConfig, fileName: string): void {
  const firstByPackage = new Map<string, PackageRegions>();
  const targetedRegions = new Set<string>();

  for (const entry of config.artifacts) {
    const regions = resolveTargets(config, entry).map(target => target.region);
    regions.forEach(region => targetedRegions.add(region));

    const packageName = entry.name ?? config.name;
    const first = firstByPackage.get(packageName);
    if (first === undefined) {
      firstByPackage.set(packageName, { objectName: entry.objectName, regions });
    } else if (!isSameRegionSet(first.regions, regions)) {
      throw new Error(
        `${fileName}: artifacts '${first.objectName}' [${first.regions.join(', ')}] and '${entry.objectName}' [${regions.join(', ')}] ` +
          `belong to package '${packageName}' but are published to different regions`,
      );
    }
  }

  for (const region of Object.keys(config.registry.bucketOverrides ?? {})) {
    if (!targetedRegions.has(region)) {
      throw new Error(`${fileName}: registry.bucketOverrides names region '${region}', which no artifact is published to`);
    }
  }
}

function isSameRegionSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every(region => right.includes(region));
}
