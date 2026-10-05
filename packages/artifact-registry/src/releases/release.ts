import type { SemVer } from 'semver';
import type { ArtifactPackage } from '../artifacts/artifact';
import type { RegionBucket } from '../artifacts/registry-location';
import type { ReleasePointerObject } from './release-pointer';

/** An artifact file of a package: the object name it is published under and its local path. */
export interface ReleaseTrackEntry {
  objectName: string;
  filePath: string;
}

/** The pointer content to write for one package: every object published in the release. `targets` are the region buckets the pointer is written to. */
export interface PackageRelease {
  package: ArtifactPackage;
  targets: RegionBucket[];
  objects: ReleasePointerObject[];
}

/** The artifact files of one package and the region buckets every one of them is copied to. */
export interface ReleaseTrackCopy {
  package: ArtifactPackage;
  targets: RegionBucket[];
  entries: ReleaseTrackEntry[];
}

/**
 * A whole release to publish: its version and the files of each package. Every package's files go
 * to every one of the package's targets before any pointer or release-track copy is written.
 */
export interface ReleaseUpload {
  version: SemVer;
  packages: ReleaseTrackCopy[];
}
