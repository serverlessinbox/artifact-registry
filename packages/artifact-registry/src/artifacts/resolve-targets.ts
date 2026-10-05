import { buildArtifactBucketName } from './artifact-target';
import { ZONE_REGIONS } from './registry-location';
import type { RegionBucket } from './registry-location';
import type { S3ArtifactEntry, S3WorkspaceConfig } from './workspace-config';

/**
 * The destinations of one artifact entry: its own `regions` when it has them, else the fixed region
 * of its `zone`, else the registry's `regions`. Each region is paired with its bucket name from
 * `buildArtifactBucketName`, so an override applies to every entry that targets that region.
 */
export function resolveTargets(config: S3WorkspaceConfig, entry: S3ArtifactEntry): RegionBucket[] {
  return selectRegions(config, entry).map(region => ({
    region,
    bucketName: buildArtifactBucketName(config.registry, region),
  }));
}

function selectRegions(config: S3WorkspaceConfig, entry: S3ArtifactEntry): string[] {
  if (entry.regions !== undefined) {
    return entry.regions;
  }
  if (entry.zone === 'edge') {
    return [ZONE_REGIONS.edge];
  }
  return config.registry.regions;
}
