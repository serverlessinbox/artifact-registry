import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { unzipSync } from 'fflate';
import { zipDirectory, zipFile } from '../zip';

const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const CENTRAL_DIRECTORY_OFFSET_FIELD = 16;
const EXTERNAL_ATTRIBUTES_FIELD = 38;

/** The Unix permission bits of the first entry, read from the ZIP central directory (APPNOTE 4.3.12, 4.3.16). */
function unixPermissionsOfFirstEntry(archive: Buffer): number {
  const centralDirectoryOffset = archive.readUInt32LE(archive.length - END_OF_CENTRAL_DIRECTORY_SIZE + CENTRAL_DIRECTORY_OFFSET_FIELD);
  return (archive.readUInt32LE(centralDirectoryOffset + EXTERNAL_ATTRIBUTES_FIELD) >>> 16) & 0o777;
}

/**
 * Pins the archive layout `zipDirectory` and `zipFile` produce: a directory keeps its structure
 * (a flattened archive would let same-named files in different folders overwrite each other on
 * extraction), a single file sits at the archive root, and the Unix mode survives (a Lambda
 * `bootstrap` binary that loses its executable bit fails at runtime).
 */
describe('zip utilities', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('zipDirectory', () => {
    it('keeps the directory structure of nested files', async () => {
      const source = path.join(dir, 'source');
      fs.mkdirSync(path.join(source, 'sub', 'deeper'), { recursive: true });
      fs.writeFileSync(path.join(source, 'root.txt'), 'root');
      fs.writeFileSync(path.join(source, 'sub', 'deeper', 'nested.txt'), 'nested');
      const outPath = path.join(dir, 'out.zip');

      await zipDirectory(source, outPath);

      const entries = unzipSync(fs.readFileSync(outPath));
      expect(Object.keys(entries).sort()).toEqual(['root.txt', 'sub/deeper/nested.txt']);
      expect(Buffer.from(entries['sub/deeper/nested.txt']).toString()).toBe('nested');
    });
  });

  describe('zipFile', () => {
    it('puts the file at the archive root under its own name', async () => {
      fs.mkdirSync(path.join(dir, 'nested'));
      const file = path.join(dir, 'nested', 'index.js');
      fs.writeFileSync(file, 'console.log(1)');
      const outPath = path.join(dir, 'out.zip');

      await zipFile(file, outPath);

      const entries = unzipSync(fs.readFileSync(outPath));
      expect(Object.keys(entries)).toEqual(['index.js']);
      expect(Buffer.from(entries['index.js']).toString()).toBe('console.log(1)');
    });

    it('preserves the executable bit of the file', async () => {
      const file = path.join(dir, 'bootstrap');
      fs.writeFileSync(file, 'binary');
      fs.chmodSync(file, 0o755);
      const outPath = path.join(dir, 'out.zip');

      await zipFile(file, outPath);

      expect(unixPermissionsOfFirstEntry(fs.readFileSync(outPath))).toBe(0o755);
    });
  });
});
