import { readFileSync } from 'fs';

/**
 * Reads and parses an artifact-versions.json file.
 * Format: { "packageName": "1.2.3", ... }
 * Returns a typed map from package name to version string.
 * Throws a descriptive error on malformed input.
 */
export function readArtifactVersions(filePath: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err: any) {
    throw new Error(`artifact-versions: cannot read ${filePath}: ${err.message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`artifact-versions: ${filePath} is not valid JSON: ${err.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`artifact-versions: ${filePath} must be a plain object`);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`artifact-versions: ${filePath}: value for "${key}" must be a string, got ${typeof value}`);
    }
    result[key] = value;
  }
  return result;
}
