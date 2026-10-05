/**
 * Pins the two-phase release publish of `RegionalPublisher`: every object reaches every region
 * bucket before any pointer or release-track copy is written, so a pointer found in a region always
 * names objects that exist there. Loosening the barrier re-opens a real defect: one failing region
 * would leave other regions pointing at objects that never arrived.
 *
 * The S3 client is the faked volatile boundary (aws-sdk-client-mock); keys come from the real
 * `buildArtifactKey`, so the assertions follow the key layout readers use.
 */

import semver from 'semver';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Uploader } from '../uploader';
import { RegionalPublisher, RegionPublishError } from '../regional-publisher';
import { buildArtifactKey } from '../../artifacts/artifact-key';
import type { ArtifactPackage } from '../../artifacts/artifact';
import type { RegionBucket } from '../../artifacts/registry-location';
import type { ReleaseUpload } from '../release';

/** One PutObject the faked S3 client received, in arrival order. */
interface RecordedPut {
  bucket: string;
  key: string;
  body: unknown;
}

const s3Mock = mockClient(S3Client);

const euBucket: RegionBucket = { region: 'eu-west-1', bucketName: 'bucket-eu' };
const overriddenUsBucket: RegionBucket = { region: 'us-east-1', bucketName: 'override-use1' };
const targets = [euBucket, overriddenUsBucket];

const libraryPackage: ArtifactPackage = { project: 'example', artifactType: 'package', name: 'alpha' };
const templatePackage: ArtifactPackage = { project: 'example', artifactType: 'template', name: 'beta-tpl' };

function publisherFor(regionBuckets: RegionBucket[]): RegionalPublisher {
  const uploaders = new Map<string, S3Uploader>();
  for (const target of regionBuckets) {
    uploaders.set(target.region, new S3Uploader(new S3Client({ region: target.region })));
  }
  return new RegionalPublisher(uploaders);
}

function releaseOf(version: string): ReleaseUpload {
  return {
    version: new semver.SemVer(version),
    packages: [
      { package: libraryPackage, targets, entries: [{ objectName: 'lambdas/a.zip', filePath: __filename }] },
      { package: templatePackage, targets, entries: [{ objectName: 'template.json', filePath: __filename }] },
    ],
  };
}

function recordedPuts(): RecordedPut[] {
  return s3Mock.commandCalls(PutObjectCommand).map(call => {
    const { Bucket, Key, Body } = call.args[0].input;
    if (Bucket === undefined || Key === undefined) {
      throw new Error('PutObjectCommand was sent without a Bucket or Key');
    }
    return { bucket: Bucket, key: Key, body: Body };
  });
}

function releaseObjectKey(pkg: ArtifactPackage, version: string, objectName: string): string {
  return buildArtifactKey(pkg.artifactType, pkg.name, { type: 'release', version: new semver.SemVer(version), objectName, project: pkg.project });
}

describe('RegionalPublisher', () => {
  beforeEach(() => {
    s3Mock.reset();
    s3Mock.on(PutObjectCommand).resolves({});
  });

  describe('uploadRelease', () => {
    it('puts every object in every region before the first pointer or alias', async () => {
      await publisherFor(targets).uploadRelease(releaseOf('1.2.3'));

      const puts = recordedPuts();
      const objectIndexes: number[] = [];
      const aliasIndexes: number[] = [];
      puts.forEach((put, index) => (put.key.includes('/releases/v1.2.3/') ? objectIndexes : aliasIndexes).push(index));

      expect(objectIndexes).toHaveLength(4);
      expect(aliasIndexes.length).toBeGreaterThan(0);
      expect(Math.max(...objectIndexes)).toBeLessThan(Math.min(...aliasIndexes));
      expect(puts.filter(p => p.key === releaseObjectKey(libraryPackage, '1.2.3', 'lambdas/a.zip')).map(p => p.bucket).sort())
        .toEqual(['bucket-eu', 'override-use1']);
    });

    it('writes the same pointer body, with one publishedAt, to every region', async () => {
      jest.useFakeTimers({
        now: new Date('2026-01-01T00:00:00.000Z'),
        doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime'],
      });
      s3Mock.on(PutObjectCommand).callsFake(async () => {
        jest.setSystemTime(Date.now() + 1000);
        return {};
      });

      try {
        await publisherFor(targets).uploadRelease(releaseOf('1.2.3'));
      } finally {
        jest.useRealTimers();
      }

      const pointerKey = buildArtifactKey('package', 'alpha', { type: 'release-pointer', track: 'v1', project: 'example' });
      const pointerPuts = recordedPuts().filter(p => p.key === pointerKey);
      expect(pointerPuts.map(p => p.bucket).sort()).toEqual(['bucket-eu', 'override-use1']);
      expect(pointerPuts[0].body).toEqual(pointerPuts[1].body);
      expect(String(pointerPuts[0].body)).toContain('"publishedAt":"2026-01-0');
    });

    it('copies template files to the latest track, and to the prerelease label for a prerelease', async () => {
      await publisherFor(targets).uploadRelease(releaseOf('1.2.3'));
      const stableKeys = recordedPuts().map(p => p.key);
      s3Mock.resetHistory();
      await publisherFor(targets).uploadRelease(releaseOf('1.2.3-beta.0'));
      const prereleaseKeys = recordedPuts().map(p => p.key);

      const trackKey = (track: string): string => buildArtifactKey('template', 'beta-tpl', { type: 'release-track', track, objectName: 'template.json', project: 'example' });
      expect(stableKeys).toContain(trackKey('latest'));
      expect(prereleaseKeys).toContain(trackKey('beta'));
      expect(prereleaseKeys).not.toContain(trackKey('latest'));
    });

    it('writes no pointer or alias in any region when an object upload fails in one region', async () => {
      s3Mock.on(PutObjectCommand, { Bucket: 'bucket-eu' }).rejects(new Error('AccessDenied'));

      const failure = await publisherFor(targets).uploadRelease(releaseOf('1.2.3')).then(() => undefined, (err: unknown) => err);

      expect(failure).toBeInstanceOf(RegionPublishError);
      if (!(failure instanceof RegionPublishError)) {
        throw new Error('expected a RegionPublishError');
      }
      expect(failure.message).toContain('bucket-eu');
      expect(failure.failed.map(f => f.target.bucketName)).toEqual(['bucket-eu', 'bucket-eu']);
      expect(failure.succeeded).toEqual([overriddenUsBucket]);
      expect(recordedPuts().filter(p => !p.key.includes('/releases/v1.2.3/'))).toEqual([]);
    });

    it('names the succeeded and failed regions when a pointer write fails in one region, and a re-run completes it', async () => {
      s3Mock.on(PutObjectCommand, { Bucket: 'bucket-eu', ContentType: 'application/json' }).rejects(new Error('AccessDenied'));

      const failure = await publisherFor(targets).uploadRelease(releaseOf('1.2.3')).then(() => undefined, (err: unknown) => err);

      if (!(failure instanceof RegionPublishError)) {
        throw new Error('expected a RegionPublishError');
      }
      expect([...new Set(failure.failed.map(f => f.target.bucketName))]).toEqual(['bucket-eu']);
      expect(failure.succeeded).toEqual([overriddenUsBucket]);

      s3Mock.reset();
      s3Mock.on(PutObjectCommand).resolves({});
      await publisherFor(targets).uploadRelease(releaseOf('1.2.3'));

      const pointerKey = buildArtifactKey('package', 'alpha', { type: 'release-pointer', project: 'example' });
      expect(recordedPuts().filter(p => p.key === pointerKey).map(p => p.bucket).sort()).toEqual(['bucket-eu', 'override-use1']);
    });

    it('fails naming the bucket, and writes no pointer, when a target region has no uploader', async () => {
      const failure = await publisherFor([euBucket]).uploadRelease(releaseOf('1.2.3')).then(() => undefined, (err: unknown) => err);

      if (!(failure instanceof RegionPublishError)) {
        throw new Error('expected a RegionPublishError');
      }
      expect(failure.message).toContain('override-use1');
      expect(failure.message).toContain('no S3 uploader for region us-east-1');
      expect(recordedPuts().filter(p => !p.key.includes('/releases/v1.2.3/'))).toEqual([]);
    });
  });
});
