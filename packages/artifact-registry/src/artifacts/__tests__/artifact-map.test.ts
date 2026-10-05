import { readArtifactMap } from '../artifact-map';

/**
 * Pins that `readArtifactMap` returns a well-formed routing map unchanged and rejects a malformed
 * entry with an error naming the plugin data and the field, instead of passing it on to an upload.
 */
describe('readArtifactMap', () => {
  it('returns a well-formed routing map', () => {
    const map = { 'a.zip': { package: { bucketName: 'b', artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip' } };

    expect(readArtifactMap(map)).toEqual(map);
  });

  it('rejects an entry whose bucketName is not a string, naming the plugin data and the field', () => {
    const map = { 'a.zip': { package: { bucketName: 5, artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip' } };

    expect(() => readArtifactMap(map)).toThrow(/s3-artifact pluginData: .*bucketName/);
  });
});
