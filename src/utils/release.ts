import type { ArtifactPackage } from './artifact';
import type { ReleasePointerObject } from './release-pointer';

/** An artifact file to copy to a release track: the object name it is published under and its local path. */
export interface ReleaseTrackEntry {
  objectName: string;
  filePath: string;
}

/** The pointer content to write for one package: every object published in the release. `region` is the region of the package's bucket. */
export interface PackageRelease {
  package: ArtifactPackage;
  region?: string;
  objects: ReleasePointerObject[];
}

/** The artifact files to copy to the release tracks of one package. `region` is the region of the package's bucket. */
export interface ReleaseTrackCopy {
  package: ArtifactPackage;
  region?: string;
  entries: ReleaseTrackEntry[];
}
