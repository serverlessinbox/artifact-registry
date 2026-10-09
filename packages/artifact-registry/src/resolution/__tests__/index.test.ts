/**
 * Pins that the `resolution` entry loads without the S3 SDK, esbuild, fflate or clipanion.
 * Construct libraries inline this entry at pack time; a runtime import of any of those packages
 * from the resolution closure drags it into their bundle. Each forbidden package is replaced by a
 * mock that records being loaded, and the entry is then loaded from source, so any import in its
 * closure, direct or transitive, shows up as a recorded load. Jest does not populate
 * `require.cache`, so the module cache cannot be inspected instead.
 */

const mockLoadedForbidden: string[] = [];

jest.mock('@aws-sdk/client-s3', () => {
  mockLoadedForbidden.push('@aws-sdk/client-s3');
  return {};
});
jest.mock('esbuild', () => {
  mockLoadedForbidden.push('esbuild');
  return {};
});
jest.mock('fflate', () => {
  mockLoadedForbidden.push('fflate');
  return {};
});
jest.mock('clipanion', () => {
  mockLoadedForbidden.push('clipanion');
  return {};
});

describe('resolution index', () => {
  let exportedNames: string[];

  beforeAll(async () => {
    exportedNames = Object.keys(await import('../index'));
  });

  it('loads the entry and its runtime exports', () => {
    expect(exportedNames.sort()).toEqual(['ArtifactResolver', 'buildArtifactArn', 'buildArtifactUrl']);
  });

  it.each(['@aws-sdk/client-s3', 'esbuild', 'fflate', 'clipanion'])('does not load %s', (forbidden) => {
    expect(mockLoadedForbidden.filter((loaded) => loaded === forbidden)).toEqual([]);
  });
});
