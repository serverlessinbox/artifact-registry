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
  /** Overrides workspace-level basePath for this artifact. */
  basePath?: string;
  /** AWS region for the S3 client used to upload this artifact. Defaults to SDK default. */
  region?: string;
  /** Bundle type. 'js-zip' bundles a TS/JS entrypoint via esbuild into a zip containing index.js. */
  bundleType?: 'js-zip';
}

/**
 * S3 workspace configuration.
 */
export interface S3WorkspaceConfig {
  /** Default S3 bucket for all artifacts in this workspace. */
  bucketName: string;
  /** Default S3 base path (e.g. 'packages/mailbox-cdk'). */
  basePath: string;
  /** Artifacts to stage and publish. */
  artifacts: S3ArtifactEntry[];
}

/**
 * Result of building artifacts.
 */
export interface ArtifactBuildResult {
  outputFiles: string[];
  routingMap: Map<string, { bucketName: string; basePath: string; region?: string; objectName: string }>;
}

/**
 * Internal mapping entry for artifact uploads.
 */
export interface ArtifactMapEntry {
  bucketName: string;
  key: string;
  region?: string;
}

export interface RequiredComponent {
  basePath: string;
  bucketName?: string;
  region?: string;
}
