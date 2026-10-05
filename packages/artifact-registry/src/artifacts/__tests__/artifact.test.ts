import { toArtifactPackageMapKey } from '../artifact';
import type { ArtifactPackage } from '../artifact';

/**
 * Pins that a package's map key distinguishes the project, the artifact type and the name: the
 * publisher groups a package's objects under this key to write one pointer per package, so two
 * packages sharing a key would have their object lists merged into one pointer.
 */
describe('toArtifactPackageMapKey', () => {
  const pkg: ArtifactPackage = { project: 'alpha', artifactType: 'package', name: 'n' };

  it('joins project, artifact type and name', () => {
    expect(toArtifactPackageMapKey(pkg)).toBe('alpha::package::n');
  });

  it('differs between projects that share a type and a name', () => {
    expect(toArtifactPackageMapKey({ ...pkg, project: 'beta' })).not.toBe(toArtifactPackageMapKey(pkg));
  });

  it('differs between artifact types that share a project and a name', () => {
    expect(toArtifactPackageMapKey({ ...pkg, artifactType: 'template' })).not.toBe(toArtifactPackageMapKey(pkg));
  });
});
