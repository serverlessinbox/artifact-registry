import { isRegistryLocation } from '../registry/registry-location';
import type { RegistryLocation } from '../registry';
import { CommandInputError } from './command-input-error';

/**
 * Builds the registry location from the `--bucket-base`, `--project` and repeatable
 * `--bucket-override region=bucket` flag values, validated by the same schema as the workspace config.
 */
export function parseRegistryLocation(bucketBase: string, project: string, overrideFlags: string[]): RegistryLocation {
  const overrides = new Map<string, string>();
  for (const flag of overrideFlags) {
    const separator = flag.indexOf('=');
    if (separator <= 0 || separator === flag.length - 1) {
      throw new CommandInputError(`--bucket-override must be in the form region=bucket, got: ${flag}`);
    }
    const region = flag.slice(0, separator);
    if (overrides.has(region)) {
      throw new CommandInputError(`--bucket-override given more than once for region ${region}`);
    }
    overrides.set(region, flag.slice(separator + 1));
  }

  const candidate: unknown = overrides.size > 0
    ? { bucketBase, project, bucketOverrides: Object.fromEntries(overrides) }
    : { bucketBase, project };
  const errors: string[] = [];
  if (!isRegistryLocation(candidate, { errors })) {
    throw new CommandInputError(`invalid registry location flags: ${errors.join('; ')}`);
  }
  return candidate;
}
