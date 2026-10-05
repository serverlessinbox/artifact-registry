import { S3Client } from '@aws-sdk/client-s3';
import type { StagedFile } from '../artifacts/artifact';
import { S3Uploader } from '../releases/uploader';

/** One uploader per distinct region of the staged files' targets, each on its own S3 client. */
export function createUploaders(files: StagedFile[]): Map<string, S3Uploader> {
  const uploaders = new Map<string, S3Uploader>();
  for (const file of files) {
    for (const target of file.routing.targets) {
      if (!uploaders.has(target.region)) {
        uploaders.set(target.region, new S3Uploader(new S3Client({ region: target.region })));
      }
    }
  }
  return uploaders;
}
