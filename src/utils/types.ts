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
}

export interface RequiredComponent {
  basePath: string;
  bucketName?: string;
  region?: string;
}
