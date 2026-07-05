export type ArtifactType = 'package' | 'template';

/**
 * S3 artifact entry configuration.
 */
export interface S3ArtifactEntry {
  /** Path to source file or directory. Absolute or relative to workspace.cwd. */
  source: string;
  /** S3 object name for the output (e.g. 'lambdas/edge-deployer.zip', 'template.json'). */
  objectName: string;
  /** Overrides workspace-level bucketName for this artifact. */
  bucketName?: string;
  /** Overrides workspace-level name for this artifact (used to build S3 key prefix). */
  name?: string;
  /** AWS region for the S3 client used to upload this artifact. Defaults to SDK default. */
  region?: string;
  /** Bundle type. 'js-zip' bundles a TS/JS entrypoint via esbuild into a zip containing index.js. */
  bundleType?: 'js-zip';
  /**
   * Artifact kind, for self-update consumers to route without hardcoding names (plan-a/plan-e).
   * Optional — existing configs that don't set this are unaffected; template-type workspaces never need it.
   */
  kind?: 'lambda-zip' | 'ui-bundle';
}

/**
 * S3 workspace configuration.
 */
export interface S3WorkspaceConfig {
  /** Default S3 bucket for all artifacts in this workspace. */
  bucketName: string;
  /** Artifact type. Determines the S3 key prefix ('packages', 'templates', …). */
  type: ArtifactType;
  /** Artifact name. Combined with type to form the S3 key prefix (e.g. 'mailbox-cdk'). */
  name: string;
  /** Artifacts to stage and publish. */
  artifacts: S3ArtifactEntry[];
}

/**
 * Result of building artifacts.
 */
export interface ArtifactBuildResult {
  outputFiles: string[];
  routingMap: Map<string, { bucketName: string; artifactType: ArtifactType; name: string; region?: string; objectName: string }>;
}

/**
 * Internal mapping entry for artifact uploads.
 */
export interface ArtifactMapEntry {
  bucketName: string;
  artifactType: ArtifactType;
  name: string;
  key: string;
  region?: string;
  /** S3 object name for this artifact (e.g. 'lambdas/admin-api.zip'), for pointer `objects[]` entries. */
  objectName: string;
  /** Artifact kind, propagated from `S3ArtifactEntry.kind`, for pointer `objects[]` entries. */
  kind?: 'lambda-zip' | 'ui-bundle';
}

export interface RequiredComponent {
  basePath: string;
  bucketName?: string;
  region?: string;
}

/**
 * Entry in the distTag-named pointer file's `objects[]` array (plan-a, stack-self-update;
 * e.g. `stable.json`, `beta.json`). Declares an artifact that was published in this release,
 * with its kind for routing.
 */
export interface LatestStableObject {
  /** S3 object name (e.g. 'lambdas/admin-api.zip'). */
  name: string;
  /**
   * Artifact kind: 'lambda-zip' for Lambda binaries, 'ui-bundle' for UI assets. Optional -- entries
   * for artifacts with no configured `kind` (see `S3ArtifactEntry.kind`) omit it; the resolver only
   * needs `name` to template an object key, `kind` is downstream routing metadata.
   */
  kind?: 'lambda-zip' | 'ui-bundle';
}

/**
 * Shape of the track-scoped, distTag-named pointer file (plan-a, stack-self-update).
 * Returned by `GET {project}/packages/{name}/releases/v{major}/{distTag}.json` (or `v{major}.{minor}`),
 * e.g. `serverlessinbox/packages/{name}/releases/v1/stable.json`.
 */
export interface LatestStablePointer {
  /** Resolved version (e.g. "1.23.5"). */
  version: string;
  /** ISO 8601 timestamp when this pointer was published. */
  publishedAt: string;
  /** Array of objects published in this release, self-describing for consumer routing. */
  objects?: LatestStableObject[];
}
