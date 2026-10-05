import { readFile } from 'fs/promises';
import * as t from 'typanion';

/** An npm package.json is a foreign document: only the fields publishing reads are listed, and `version` is required. */
export const isPackageJson = t.isPartial({ version: t.isString() });

export type PackageJson = t.InferType<typeof isPackageJson>;

/** Reads and validates a package.json. Throws a field-level error naming the file when malformed. */
export async function readPackageJson(filePath: string): Promise<PackageJson> {
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  const errors: string[] = [];
  if (!isPackageJson(parsed, { errors })) {
    throw new Error(`${filePath}: ${errors.join('; ')}`);
  }
  return parsed;
}
