import * as path from 'path';
import semver from 'semver';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage, PackResult, PackFileResult } from '@jwpkg/gitversion';
import { S3Client } from '@aws-sdk/client-s3';
import { RegionalPublisher, S3Uploader, buildArtifactKey, buildArtifacts, toArtifactPackageMapKey } from '@serverlessinbox/artifact-registry';
import type { RegionBucket, ReleasePointerObject } from '@serverlessinbox/artifact-registry';
import { readArtifactMap } from './artifact-map';
import type { ArtifactMap } from './artifact-map';

/**
 * gitversion plugin that packs the artifacts a workspace declares in its config file and publishes
 * them to S3 at the versioned release path, followed by the version pointers. `onPostPack` stages
 * the files once the other pack managers have finished building, and records each file's routing in
 * the package's plugin data; `publish` uploads from that record and does no config lookup of its own.
 * `pack` stages nothing, because it runs in parallel with the build that produces the artifacts.
 */
class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  private uploaders: Map<string, S3Uploader> = new Map();
  private uploadedBasenames: Map<string, Set<string>> = new Map();

  constructor() {}

  get packManager(): IPackManager {
    return this;
  }

  async pack(): Promise<null> {
    return null;
  }

  async onPostPack(_application: unknown, workspace: IWorkspace, outputFolder: string): Promise<PackResult | void> {
    const built = await buildArtifacts(workspace.cwd, outputFolder);
    if (built.outputFiles.length === 0) {
      return;
    }

    const version = semver.parse(workspace.version);
    if (!version) throw new Error(`Invalid semver version from workspace: ${workspace.version}`);

    const files: PackFileResult[] = [];
    for (const [basename, routing] of built.routingMap) {
      const pkg = routing.package;
      const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version, objectName: routing.objectName, project: pkg.project });
      files.push({
        name: basename,
        metadata: {
          package: pkg,
          key,
          targets: routing.targets,
          objectName: routing.objectName,
        },
      });
      console.log(`[s3-artifact] Packing: ${routing.objectName}`);
    }

    console.log(`[s3-artifact] Staged ${files.length} artifact(s) from ${workspace.cwd}/artifact-registry.json`);
    return { files };
  }

  async publish(packedPackage: PackedPackage, fileName: string, releaseTag: string, dryRun: boolean): Promise<void> {
    const basename = path.basename(fileName);

    const rawPluginData = packedPackage.pluginData?.['s3-artifact'];
    const pluginData = rawPluginData === undefined
      ? undefined
      : readArtifactMap(rawPluginData);
    const mapEntry = pluginData?.[basename];

    if (pluginData === undefined || mapEntry === undefined) {
      console.log(`[s3-artifact] ERROR: no routing found for ${basename} — was the postPack staging run first?`);
      return;
    }

    const { key, targets } = mapEntry;

    if (dryRun) {
      for (const target of targets) {
        console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${target.bucketName}/${key}`);
      }
      return;
    }

    const versionStr = packedPackage.version;
    const version = semver.parse(versionStr);
    if (!version) throw new Error(`Invalid semver version from packed package: ${versionStr}`);
    const pkg = mapEntry.package;
    const pkgMapKey = toArtifactPackageMapKey(pkg);

    this.ensureUploaders(targets);
    const publisher = new RegionalPublisher(this.uploaders);
    console.log(`[s3-artifact] Uploading: ${basename} to ${targets.map(t => `s3://${t.bucketName}/${key}`).join(', ')}`);
    await publisher.uploadObject(targets, key, fileName);
    console.log(`[s3-artifact] Upload complete: ${basename}`);

    const uploaded = this.uploadedBasenames.get(pkgMapKey) ?? new Set<string>();
    uploaded.add(basename);
    this.uploadedBasenames.set(pkgMapKey, uploaded);

    const objects = this.objectsOnceComplete(pluginData, pkgMapKey, uploaded);
    if (objects !== undefined) {
      await publisher.writeVersionPointers({ package: pkg, targets, objects }, version);
    }
  }

  private ensureUploaders(targets: RegionBucket[]): void {
    for (const target of targets) {
      if (!this.uploaders.has(target.region)) {
        this.uploaders.set(target.region, new S3Uploader(new S3Client({ region: target.region })));
      }
    }
  }

  /** The objects of the package's release, or `undefined` while a file of the package is still to be uploaded. */
  private objectsOnceComplete(pluginData: ArtifactMap, pkgMapKey: string, uploaded: ReadonlySet<string>): ReleasePointerObject[] | undefined {
    const siblingNames: string[] = [];
    const objects: ReleasePointerObject[] = [];
    for (const [name, entry] of Object.entries(pluginData)) {
      if (toArtifactPackageMapKey(entry.package) === pkgMapKey) {
        siblingNames.push(name);
        objects.push({ name: entry.objectName });
      }
    }
    return siblingNames.every(name => uploaded.has(name)) ? objects : undefined;
  }
}

export { S3ArtifactPlugin };
