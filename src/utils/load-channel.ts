import { S3Uploader } from './uploader';
import { buildArtifactKey } from './artifact-key';

export interface ChannelVersionsOptions {
  /** Channel name, e.g. 'dev'. */
  channel: string;
  /** Base bucket name without region suffix, e.g. 'mailbox-artifacts'. */
  bucketBase: string;
  /** Map of packageName → region. */
  packages: Record<string, string>;
}

/**
 * Reads the latest-stable.json pointer for each package in parallel and returns
 * a map of packageName → semver version string.
 *
 * No CDK imports — pure S3 + JSON.
 */
export async function loadChannelVersions(options: ChannelVersionsOptions): Promise<Record<string, string>> {
  const entries = Object.entries(options.packages);

  const results = await Promise.all(
    entries.map(async ([packageName, region]) => {
      const bucket = `${options.bucketBase}-${region}`;
      const key = buildArtifactKey('package', packageName, {
        type: 'channel-pointer',
        channel: options.channel,
      });
      const uploader = new S3Uploader({ region });
      const pointer = await uploader.readJson(bucket, key) as { version: string };
      return [packageName, pointer.version] as const;
    }),
  );

  return Object.fromEntries(results);
}
