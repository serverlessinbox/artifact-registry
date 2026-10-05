import { readFile } from 'fs/promises';
import * as t from 'typanion';

/** A flat JSON object mapping each component name to its version string. */
export const isComponentVersions = t.isDict(t.isString());

export type ComponentVersions = t.InferType<typeof isComponentVersions>;

/** Reads and validates a component versions file. Throws a field-level error naming the file when malformed. */
export async function readComponentVersions(filePath: string): Promise<ComponentVersions> {
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  const errors: string[] = [];
  if (!isComponentVersions(parsed, { errors })) {
    throw new Error(`${filePath}: ${errors.join('; ')}`);
  }
  return parsed;
}
