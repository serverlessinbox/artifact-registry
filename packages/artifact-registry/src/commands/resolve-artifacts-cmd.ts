import { Command, Option } from 'clipanion';
import * as fs from 'fs/promises';
import * as path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { buildArtifactKey } from '../artifacts/artifact-key';
import { loadReleasePointer } from '../releases/release-pointer';
import { isArtifactType } from '../artifacts/artifact';
import type { ArtifactType } from '../artifacts/artifact';
import { buildArtifactBucketName } from '../registry';
import type { RegistryLocation } from '../registry';
import { isArtifactZone, ZONE_REGIONS } from '../registry/registry-location';
import type { ArtifactVersionsEntry, ArtifactZone } from '../resolution';
import { CommandInputError } from './command-input-error';
import { parseRegistryLocation } from './registry-location-flags';

/** One validated `--component key:type:name:zone` value. */
interface RequestedComponent {
  readonly key: string;
  readonly artifactType: ArtifactType;
  readonly name: string;
  readonly zone: ArtifactZone;
}

/**
 * Reads the release pointer of each requested component from S3 and writes an artifact-versions
 * JSON file, `{ "<key>": { "version": "...", "zone": "..." } }`, to every `--output` path. Only
 * reads pointers; it never publishes.
 */
export class ResolveArtifactsCommand extends Command {
  static override paths = [['resolve-artifacts']];

  static override usage = Command.Usage({
    description: 'Resolve component artifact versions from S3 release pointers and write artifact-versions.json, one { version, zone } entry per component. A component of zone edge is read from the edge zone\'s fixed region whatever --region says; a component of zone regional is read from the --region bucket. Pointers can be track-scoped (--track) or global (no --track).',
    examples: [
      [
        'Resolve a regional and an edge component from the global stable pointer',
        '$0 resolve-artifacts --bucket-base example-artifacts --project example --region eu-west-1 --component api:package:example-api:regional --component cdn:package:example-edge:edge --output artifact-versions.json --output packages/app/artifact-versions.json',
      ],
    ],
  });

  bucketBase = Option.String('--bucket-base', {
    required: true,
    description: 'Bucket name prefix: the bucket of the region is {bucket-base}-{region} unless overridden.',
  });

  bucketOverrides = Option.Array('--bucket-override', [], {
    description: 'Bucket name for one region, in the form region=bucket, replacing {bucket-base}-{region}. Repeatable.',
  });

  project = Option.String('--project', {
    required: true,
    description: 'Project prefix that leads every object key.',
  });

  region = Option.String('--region', {
    required: true,
    description: 'Region whose bucket is read for components of zone regional; also the region of the S3 client. Components of zone edge ignore it.',
  });

  profile = Option.String('--profile', {
    description: 'AWS profile to use.',
  });

  components = Option.Array('--component', {
    required: true,
    description: 'Component in the form key:type:name:zone, where type is package or template and zone is regional or edge (e.g. api:package:example-api:regional). The zone is required. Repeatable.',
  });

  track = Option.String('--track', {
    description: 'Release track to resolve, e.g. v1 or v1.2. When omitted, resolves the global untracked stable pointer.',
  });

  outputs = Option.Array('--output', {
    required: true,
    description: 'Output file path. Repeatable (writes to every path given).',
  });

  async execute(): Promise<number> {
    if (this.profile) {
      process.env.AWS_PROFILE = this.profile;
    }

    let location: RegistryLocation;
    let requested: RequestedComponent[];
    try {
      location = parseRegistryLocation(this.bucketBase, this.project, this.bucketOverrides);
      requested = this.components.map(component => this.parseComponent(component));
    } catch (err: unknown) {
      if (err instanceof CommandInputError) {
        this.context.stderr.write(`Error: ${err.message}\n`);
        return 1;
      }
      throw err;
    }

    const client = new S3Client({ region: this.region, followRegionRedirects: true });
    const result: Record<string, ArtifactVersionsEntry> = {};

    for (const component of requested) {
      const bucket = buildArtifactBucketName(location, this.regionOfZone(component.zone));
      const s3Key = buildArtifactKey(component.artifactType, component.name, { type: 'release-pointer', track: this.track, project: this.project });

      this.context.stdout.write(`Resolving ${component.key} from s3://${bucket}/${s3Key} ... `);
      const pointer = await loadReleasePointer(client, bucket, s3Key);
      result[component.key] = { version: pointer.version, zone: component.zone };
      this.context.stdout.write(`${pointer.version}\n`);
    }

    const json = JSON.stringify(result, null, 2) + '\n';
    for (const output of this.outputs) {
      const outPath = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
      await fs.writeFile(outPath, json);
      this.context.stdout.write(`Written: ${outPath}\n`);
    }

    return 0;
  }

  private parseComponent(component: string): RequestedComponent {
    const parts = component.split(':');
    if (parts.length !== 4) {
      throw new CommandInputError(`--component must be in the form key:type:name:zone, got: ${component}`);
    }
    const [key, artifactType, name, zone] = parts;
    if (!isArtifactType(artifactType)) {
      throw new CommandInputError(`--component type must be 'package' or 'template', got: ${artifactType} (component ${component})`);
    }
    if (!isArtifactZone(zone)) {
      throw new CommandInputError(`--component zone must be 'regional' or 'edge', got: ${zone} (component ${component})`);
    }
    return { key, artifactType, name, zone };
  }

  private regionOfZone(zone: ArtifactZone): string {
    return zone === 'edge' ? ZONE_REGIONS.edge : this.region;
  }
}
