import * as fs from 'fs/promises';
import * as path from 'path';
import { zip } from 'fflate';
import type { AsyncZipOptions, AsyncZippable } from 'fflate';

/** The archive entry for one file: its bytes and the Unix mode that extraction restores (a Lambda `bootstrap` must stay executable). */
type ZipEntry = [Uint8Array, AsyncZipOptions];

/** ZIP "version made by" host system: 3 is Unix, the only value for which the mode attribute is honoured. */
const ZIP_OS_UNIX = 3;

/** Zips every file under `dir` into `outPath`, keeping each file's path relative to `dir` inside the archive. */
export async function zipDirectory(dir: string, outPath: string): Promise<void> {
  const relativePaths = await fs.readdir(dir, { recursive: true });
  const entries: AsyncZippable = {};
  for (const relativePath of relativePaths) {
    const file = path.join(dir, relativePath);
    const stats = await fs.stat(file);
    if (stats.isFile()) {
      entries[relativePath.split(path.sep).join('/')] = await readEntry(file, stats.mode);
    }
  }
  await writeArchive(entries, outPath);
}

/** Zips a single file into `outPath`, at the root of the archive under the file's own name. */
export async function zipFile(file: string, outPath: string): Promise<void> {
  const stats = await fs.stat(file);
  const entries: AsyncZippable = { [path.basename(file)]: await readEntry(file, stats.mode) };
  await writeArchive(entries, outPath);
}

async function readEntry(file: string, mode: number): Promise<ZipEntry> {
  const data = await fs.readFile(file);
  return [data, { os: ZIP_OS_UNIX, attrs: (mode << 16) >>> 0 }];
}

async function writeArchive(entries: AsyncZippable, outPath: string): Promise<void> {
  const archive = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, (err, data) => (err ? reject(err) : resolve(data)));
  });
  await fs.writeFile(outPath, archive);
}
