import { readFileSync } from 'fs';

/**
 * Zone designation for an artifact.
 * - 'regional': Use the deployment region's artifact bucket.
 * - 'edge': Always use us-east-1 for edge deployments.
 */
export type ArtifactZone = 'regional' | 'edge';

/**
 * Parsed entry from artifact-versions.json.
 * Supports both plain string (backward compat) and rich object format.
 */
export interface ArtifactVersionsEntry {
  readonly version: string;
  readonly zone: ArtifactZone;
}

/**
 * Result of parsing artifact-versions.json.
 * Includes per-package entries and optional top-level bucketBase.
 */
export interface ParsedArtifactVersions {
  readonly packages: Record<string, ArtifactVersionsEntry>;
  readonly bucketBase?: string;
}

/**
 * Reads and parses an artifact-versions.json file.
 *
 * Format (backward compatible):
 *   Plain string format: { "packageName": "1.2.3", ... }
 *   Rich format: { "packageName": { "version": "1.2.3", "zone": "regional" }, ... }
 *   With bucketBase: { "bucketBase": "my-bucket", "pkg1": "1.2.3", ... }
 *
 * Plain string entries default zone to 'regional'.
 * Returns parsed packages and optional bucketBase.
 * Throws a descriptive error on malformed input.
 */
export function readArtifactVersions(filePath: string): ParsedArtifactVersions {
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

  const result: Record<string, ArtifactVersionsEntry> = {};
  let bucketBase: string | undefined;

  for (const [key, value] of Object.entries(parsed)) {
    // Handle top-level bucketBase field
    if (key === 'bucketBase') {
      if (typeof value !== 'string') {
        throw new Error(`artifact-versions: ${filePath}: bucketBase must be a string, got ${typeof value}`);
      }
      bucketBase = value;
      continue;
    }

    let version: string;
    let zone: ArtifactZone = 'regional'; // default

    if (typeof value === 'string') {
      // Plain string format: defaults to regional zone
      version = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Rich object format
      const obj = value as Record<string, unknown>;
      if (typeof obj.version !== 'string') {
        throw new Error(`artifact-versions: ${filePath}: entry "${key}" must have a "version" string field`);
      }
      version = obj.version;

      if (obj.zone !== undefined) {
        if (typeof obj.zone !== 'string') {
          throw new Error(`artifact-versions: ${filePath}: entry "${key}" zone must be a string, got ${typeof obj.zone}`);
        }
        if (obj.zone !== 'regional' && obj.zone !== 'edge') {
          throw new Error(`artifact-versions: ${filePath}: entry "${key}" zone must be 'regional' or 'edge', got "${obj.zone}"`);
        }
        zone = obj.zone as ArtifactZone;
      }
    } else {
      throw new Error(`artifact-versions: ${filePath}: value for "${key}" must be a string or object with version field, got ${typeof value}`);
    }

    result[key] = { version, zone };
  }

  return { packages: result, bucketBase };
}
