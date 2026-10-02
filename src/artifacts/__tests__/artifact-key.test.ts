/**
 * Pins the exact S3 key string `buildArtifactKey` produces for every spec type, with the default
 * and an explicit project prefix, and for pointers with and without a track and distTag. These keys
 * are where objects are written and read, so a changed layout makes existing objects unfindable.
 */

import {
  buildArtifactKey,
  DEFAULT_PROJECT,
  DEFAULT_DIST_TAG,
  VERSION_PLACEHOLDER,
  OBJECT_NAME_PLACEHOLDER,
} from '../artifact-key';

describe('buildArtifactKey', () => {
  describe('defaults', () => {
    it('DEFAULT_PROJECT is serverlessinbox', () => {
      expect(DEFAULT_PROJECT).toBe('serverlessinbox');
    });

    it('DEFAULT_DIST_TAG is stable', () => {
      expect(DEFAULT_DIST_TAG).toBe('stable');
    });
  });

  describe("'release' spec", () => {
    it('defaults the project prefix to serverlessinbox', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release',
        version: { version: '1.2.3' },
        objectName: 'lambdas/admin-api.zip',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/v1.2.3/lambdas/admin-api.zip');
    });

    it('honors an explicit project override', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release',
        version: { version: '1.2.3' },
        objectName: 'lambdas/admin-api.zip',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/v1.2.3/lambdas/admin-api.zip');
    });

    it('applies the project prefix to template artifacts too', () => {
      const key = buildArtifactKey('template', 'mailbox-cdk', {
        type: 'release',
        version: { version: '2.0.0' },
        objectName: 'template.json',
      });
      expect(key).toBe('serverlessinbox/templates/mailbox-cdk/releases/v2.0.0/template.json');
    });
  });

  describe("'release-pointer' spec (unified, track-scoped, distTag-named)", () => {
    it('matches the spec worked example: serverlessinbox/packages/admin-api/releases/v1/stable.json', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        track: 'v1',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/v1/stable.json');
    });

    it('matches the spec worked example: serverlessinbox/packages/admin-api/releases/v1/beta.json', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        track: 'v1',
        distTag: 'beta',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/v1/beta.json');
    });

    it('matches the spec worked example: serverlessinbox/packages/webmail-ui/releases/v1.2/calendar.json', () => {
      const key = buildArtifactKey('package', 'webmail-ui', {
        type: 'release-pointer',
        track: 'v1.2',
        distTag: 'calendar',
      });
      expect(key).toBe('serverlessinbox/packages/webmail-ui/releases/v1.2/calendar.json');
    });

    it('defaults distTag to stable when omitted', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'release-pointer',
        track: 'v3',
      });
      expect(key).toBe('serverlessinbox/packages/mailbox-go/releases/v3/stable.json');
    });

    it('honors an explicit project override alongside an explicit distTag', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'release-pointer',
        track: 'v3',
        distTag: 'beta',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/mailbox-go/releases/v3/beta.json');
    });

    it('never emits a latest- prefixed filename', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'release-pointer',
        track: 'v1',
      });
      expect(key).not.toContain('latest-');
      expect(key.endsWith('/stable.json')).toBe(true);
    });

    it('emits the global (untracked) pointer when track is omitted', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/stable.json');
    });

    it('emits the global pointer with explicit distTag when track is omitted', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        distTag: 'beta',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/beta.json');
    });

    it('honors project override for global pointer', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release-pointer',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/stable.json');
    });
  });

  describe("'channel' / 'channel-prefix' specs", () => {
    it('defaults the project prefix to serverlessinbox for a channel object key', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'channel',
        channel: 'dev',
        objectName: 'lambdas/admin-api.zip',
      });
      expect(key).toBe('serverlessinbox/packages/mailbox-go/channels/dev/lambdas/admin-api.zip');
    });

    it('honors an explicit project override for a channel object key', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'channel',
        channel: 'dev',
        objectName: 'lambdas/admin-api.zip',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/mailbox-go/channels/dev/lambdas/admin-api.zip');
    });

    it('defaults the project prefix to serverlessinbox for a channel prefix', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'channel-prefix',
        channel: 'dev',
      });
      expect(key).toBe('serverlessinbox/packages/mailbox-go/channels/dev/');
    });

    it('honors an explicit project override for a channel prefix', () => {
      const key = buildArtifactKey('package', 'mailbox-go', {
        type: 'channel-prefix',
        channel: 'dev',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/mailbox-go/channels/dev/');
    });
  });

  describe("'release-track' spec", () => {
    it('defaults the project prefix to serverlessinbox', () => {
      const key = buildArtifactKey('template', 'mailbox-cdk', {
        type: 'release-track',
        track: 'latest',
        objectName: 'template.json',
      });
      expect(key).toBe('serverlessinbox/templates/mailbox-cdk/releases/latest/template.json');
    });

    it('honors an explicit project override', () => {
      const key = buildArtifactKey('template', 'mailbox-cdk', {
        type: 'release-track',
        track: 'latest',
        objectName: 'template.json',
        project: 'acme',
      });
      expect(key).toBe('acme/templates/mailbox-cdk/releases/latest/template.json');
    });
  });

  describe("'release-template' spec", () => {
    it('builds a release key with literal {version}/{objectName} placeholders', () => {
      const key = buildArtifactKey('template', 'mailbox-standard', {
        type: 'release-template',
      });
      expect(key).toBe(
        `serverlessinbox/templates/mailbox-standard/releases/v${VERSION_PLACEHOLDER}/${OBJECT_NAME_PLACEHOLDER}`,
      );
    });

    it('honors an explicit project override', () => {
      const key = buildArtifactKey('template', 'mailbox-standard', {
        type: 'release-template',
        project: 'acme',
      });
      expect(key).toBe(
        `acme/templates/mailbox-standard/releases/v${VERSION_PLACEHOLDER}/${OBJECT_NAME_PLACEHOLDER}`,
      );
    });
  });
});
