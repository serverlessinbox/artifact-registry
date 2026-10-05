import { readFile } from 'fs/promises';
import * as t from 'typanion';

const isPackageJsonWithVersion = t.isObject({
  version: t.isString(),
}, { extra: t.isUnknown() });

/**
 * Reads the version field from a package.json file at the given path.
 * Throws an error naming the path if the file cannot be read or does not contain a valid version string.
 */
export async function readPackageVersion(packageJsonPath: string): Promise<string> {
  const content = await readFile(packageJsonPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err: unknown) {
    throw new Error(`${packageJsonPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const errors: string[] = [];
  if (!isPackageJsonWithVersion(parsed, { errors })) {
    throw new Error(`${packageJsonPath}: ${errors.join('; ')}`);
  }
  return parsed.version;
}
