import { registryRecordKey, parseRegistryRecord } from '../registry-record';

/**
 * Pins the registry record's key and its validation: a record that parses is complete and its
 * errors name the source, so a bad file or bucket object is traceable.
 */
describe('registry-record', () => {
  describe('registryRecordKey', () => {
    it('builds the record key from project', () => {
      expect(registryRecordKey('serverlessinbox')).toBe('serverlessinbox/registry.json');
      expect(registryRecordKey('example')).toBe('example/registry.json');
    });
  });

  describe('parseRegistryRecord', () => {
    it('parses a valid registry record', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1', 'us-east-1'],
        ownerAccountId: '123456789012',
      });
      const record = parseRegistryRecord(text, 'test-source');
      expect(record.schemaVersion).toBe(1);
      expect(record.bucketBase).toBe('artifacts');
      expect(record.project).toBe('example');
      expect(record.regions).toEqual(['eu-west-1', 'us-east-1']);
      expect(record.ownerAccountId).toBe('123456789012');
    });

    it('rejects invalid JSON', () => {
      expect(() => parseRegistryRecord('not json', 'test-source')).toThrow(
        'registry record test-source: not valid JSON'
      );
    });

    it('rejects wrong schemaVersion', () => {
      const text = JSON.stringify({
        schemaVersion: 2,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        ownerAccountId: '123456789012',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects missing ownerAccountId', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects malformed ownerAccountId', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        ownerAccountId: 'not-a-number',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('rejects empty regions array', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: [],
        ownerAccountId: '123456789012',
      });
      expect(() => parseRegistryRecord(text, 'test-source')).toThrow('registry record test-source:');
    });

    it('includes source in error message', () => {
      const text = JSON.stringify({ invalid: 'data' });
      expect(() => parseRegistryRecord(text, 'my-source.json')).toThrow('my-source.json');
    });

    it('accepts valid bucketOverrides', () => {
      const text = JSON.stringify({
        schemaVersion: 1,
        bucketBase: 'artifacts',
        project: 'example',
        regions: ['eu-west-1'],
        bucketOverrides: { 'us-east-1': 'custom-bucket' },
        ownerAccountId: '123456789012',
      });
      const record = parseRegistryRecord(text, 'test-source');
      expect(record.bucketOverrides).toEqual({ 'us-east-1': 'custom-bucket' });
    });
  });
});
