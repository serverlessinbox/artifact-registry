import { readArtifactMap } from '../artifact-map';

/**
 * Pins that `readArtifactMap` returns a well-formed routing map unchanged and rejects a malformed
 * entry with an error naming the plugin data and the field, instead of passing it on to an upload.
 */
describe('readArtifactMap', () => {
  const targets = [{ region: 'eu-west-1', bucketName: 'b-eu-west-1' }];

  it('returns a well-formed routing map', () => {
    const map = { 'a.zip': { package: { project: 'p', artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip', targets } };

    expect(readArtifactMap(map)).toEqual(map);
  });

  it('rejects an entry whose project is not a string, naming the plugin data and the field', () => {
    const map = { 'a.zip': { package: { project: 5, artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip', targets } };

    expect(() => readArtifactMap(map)).toThrow(/s3-artifact pluginData: .*project/);
  });

  it('rejects an entry whose target has no bucketName, naming the plugin data and the field', () => {
    const map = { 'a.zip': { package: { project: 'p', artifactType: 'package', name: 'n' }, key: 'k', objectName: 'a.zip', targets: [{ region: 'eu-west-1' }] } };

    expect(() => readArtifactMap(map)).toThrow(/s3-artifact pluginData: .*bucketName/);
  });
});
