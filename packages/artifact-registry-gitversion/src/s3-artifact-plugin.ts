import * as path from 'path';
import semver from 'semver';
import type { IPlugin, IPackManager, IWorkspace, PackedPackage, PackResult, PackFileResult } from '@jwpkg/gitversion';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Uploader, buildArtifactKey, buildArtifacts, toArtifactPackageMapKey } from '@serverlessinbox/artifact-registry';
import type { ReleasePointerObject } from '@serverlessinbox/artifact-registry';
import { readArtifactMap } from './artifact-map';

/**
 * gitversion plugin that packs the artifacts a workspace declares in its config file and publishes
 * them to S3 at the versioned release path, followed by the version pointers. `pack` records each
 * file's routing in the package's plugin data; `publish` uploads from that record and does no
 * config lookup of its own.
 */
class S3ArtifactPlugin implements IPlugin, IPackManager {
  readonly ident = 's3-artifact';
  readonly name = 'S3 artifact plugin';

  constructor() {}

  get packManager(): IPackManager {
    return this;
  }

  async pack(workspace: IWorkspace, outputFolder: string): Promise<PackResult | null> {
    const built = await buildArtifacts(workspace.cwd, outputFolder);
    if (built.outputFiles.length === 0) {
      return null;
    }

    const version = semver.parse(workspace.version);
    if (!version) throw new Error(`Invalid semver version from workspace: ${workspace.version}`);

    const files: PackFileResult[] = [];
    for (const [basename, routing] of built.routingMap) {
      const pkg = routing.package;
      const key = buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version, objectName: routing.objectName });
      files.push({
        name: basename,
        metadata: {
          package: pkg,
          key,
          region: routing.region,
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

    if (mapEntry === undefined) {
      console.log(`[s3-artifact] ERROR: no routing found for ${basename} — was pack run first?`);
      return;
    }

    const { key, region } = mapEntry;
    const { bucketName } = mapEntry.package;
    const uploader = new S3Uploader(new S3Client({ region }));

    if (dryRun) {
      console.log(`[s3-artifact] [dry-run] Would upload ${basename} → s3://${bucketName}/${key}`);
      return;
    }

    console.log(`[s3-artifact] Uploading: s3://${bucketName}/${key}`);
    await uploader.upload(bucketName, key, fileName);
    console.log(`[s3-artifact] Upload complete: s3://${bucketName}/${key}`);

    const versionStr = packedPackage.version;
    const version = semver.parse(versionStr);
    if (!version) throw new Error(`Invalid semver version from packed package: ${versionStr}`);
    const pkg = mapEntry.package;
    const pkgMapKey = toArtifactPackageMapKey(pkg);

    // `pluginData` holds the routing of every file of this package, not just the one being uploaded,
    // so `objects[]` is built from all siblings sharing bucket, type and name. The pointer is then
    // the same whichever file's publish() call writes it.
    const objects: ReleasePointerObject[] = pluginData
      ? Object.values(pluginData)
          .filter(e => toArtifactPackageMapKey(e.package) === pkgMapKey)
          .map(e => ({ name: e.objectName }))
      : [{ name: mapEntry.objectName }];

    await uploader.writeVersionPointers({ package: pkg, region, objects }, version);
  }
}

export { S3ArtifactPlugin };
