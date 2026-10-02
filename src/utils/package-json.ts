import { readFileSync } from 'fs';
import * as t from 'typanion';

/** An npm package.json is a foreign document: only the fields publishing reads are listed, and `version` is required. */
export const isPackageJson = t.isPartial({ version: t.isString() });

export type PackageJson = t.InferType<typeof isPackageJson>;

/** Reads and validates a package.json. Throws a field-level error naming the file when malformed. */
export function readPackageJson(filePath: string): PackageJson {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  const errors: string[] = [];
  if (!isPackageJson(parsed, { errors })) {
    throw new Error(`${filePath}: ${errors.join('; ')}`);
  }
  return parsed;
}
