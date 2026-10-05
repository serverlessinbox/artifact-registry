/**
 * Pins the exact S3 key string `buildArtifactKey` produces for every spec type, led by the project
 * the caller names, and for pointers with and without a track and distTag. These keys are where
 * objects are written and read, so a changed layout makes existing objects unfindable.
 */

import {
  buildArtifactKey,
  DEFAULT_DIST_TAG,
  VERSION_PLACEHOLDER,
  OBJECT_NAME_PLACEHOLDER,
} from '../artifact-key';

describe('buildArtifactKey', () => {
  describe('defaults', () => {
    it('DEFAULT_DIST_TAG is stable', () => {
      expect(DEFAULT_DIST_TAG).toBe('stable');
    });
  });

  describe("'release' spec", () => {
    it('leads the key with the given project', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release',
        version: { version: '1.2.3' },
        objectName: 'lambdas/admin-api.zip',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/v1.2.3/lambdas/admin-api.zip');
    });

    it('applies the project prefix to template artifacts too', () => {
      const key = buildArtifactKey('template', 'example-cdk', {
        type: 'release',
        version: { version: '2.0.0' },
        objectName: 'template.json',
        project: 'acme',
      });
      expect(key).toBe('acme/templates/example-cdk/releases/v2.0.0/template.json');
    });
  });

  describe("'release-pointer' spec (unified, track-scoped, distTag-named)", () => {
    it('matches the spec worked example: acme/packages/admin-api/releases/v1/stable.json', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        track: 'v1',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/v1/stable.json');
    });

    it('matches the spec worked example: acme/packages/admin-api/releases/v1/beta.json', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        track: 'v1',
        distTag: 'beta',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/v1/beta.json');
    });

    it('matches the spec worked example: acme/packages/webmail-ui/releases/v1.2/calendar.json', () => {
      const key = buildArtifactKey('package', 'webmail-ui', {
        type: 'release-pointer',
        track: 'v1.2',
        distTag: 'calendar',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/webmail-ui/releases/v1.2/calendar.json');
    });

    it('defaults distTag to stable when omitted', () => {
      const key = buildArtifactKey('package', 'example-go', {
        type: 'release-pointer',
        track: 'v3',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/example-go/releases/v3/stable.json');
    });

    it('never emits a latest- prefixed filename', () => {
      const key = buildArtifactKey('package', 'example-go', {
        type: 'release-pointer',
        track: 'v1',
        project: 'acme',
      });
      expect(key).not.toContain('latest-');
      expect(key.endsWith('/stable.json')).toBe(true);
    });

    it('emits the global (untracked) pointer when track is omitted', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/stable.json');
    });

    it('emits the global pointer with explicit distTag when track is omitted', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        distTag: 'beta',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/beta.json');
    });
  });

  describe("'channel' / 'channel-prefix' specs", () => {
    it('leads a channel object key with the given project', () => {
      const key = buildArtifactKey('package', 'example-go', {
        type: 'channel',
        channel: 'dev',
        objectName: 'lambdas/admin-api.zip',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/example-go/channels/dev/lambdas/admin-api.zip');
    });

    it('leads a channel prefix with the given project', () => {
      const key = buildArtifactKey('package', 'example-go', {
        type: 'channel-prefix',
        channel: 'dev',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/example-go/channels/dev/');
    });
  });

  describe("'release-track' spec", () => {
    it('leads the key with the given project', () => {
      const key = buildArtifactKey('template', 'example-cdk', {
        type: 'release-track',
        track: 'latest',
        objectName: 'template.json',
        project: 'acme',
      });
      expect(key).toBe('acme/templates/example-cdk/releases/latest/template.json');
    });
  });

  describe("'release-template' spec", () => {
    it('builds a release key with literal {version}/{objectName} placeholders', () => {
      const key = buildArtifactKey('template', 'example-standard', {
        type: 'release-template',
        project: 'acme',
      });
      expect(key).toBe(
        `acme/templates/example-standard/releases/v${VERSION_PLACEHOLDER}/${OBJECT_NAME_PLACEHOLDER}`,
      );
    });
  });
});
