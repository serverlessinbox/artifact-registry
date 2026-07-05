/**
 * Unit tests for `buildArtifactKey` (project prefix, distTag pointers, no `latest-`).
 *
 * Covers:
 * - 'release' spec: default project prefix, explicit project override.
 * - 'release-pointer' spec (unified, track-scoped, distTag-named): default project/distTag,
 *   explicit distTag (beta/calendar), explicit project, exact key strings matching the spec's
 *   worked examples.
 * - 'channel' / 'channel-prefix' / 'release-track' specs: all emit the same `{project}/` prefix
 *   as 'release'/'release-pointer', defaulting to DEFAULT_PROJECT with an explicit override available.
 */

import type { SemVer } from 'semver';
import { buildArtifactKey, DEFAULT_PROJECT, DEFAULT_DIST_TAG } from '../artifact-key';

function fakeVersion(version: string): SemVer {
  return { version } as unknown as SemVer;
}

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
        version: fakeVersion('1.2.3'),
        objectName: 'lambdas/admin-api.zip',
      });
      expect(key).toBe('serverlessinbox/packages/admin-api/releases/v1.2.3/lambdas/admin-api.zip');
    });

    it('honors an explicit project override', () => {
      const key = buildArtifactKey('package', 'admin-api', {
        type: 'release',
        version: fakeVersion('1.2.3'),
        objectName: 'lambdas/admin-api.zip',
        project: 'acme',
      });
      expect(key).toBe('acme/packages/admin-api/releases/v1.2.3/lambdas/admin-api.zip');
    });

    it('applies the project prefix to template artifacts too', () => {
      const key = buildArtifactKey('template', 'mailbox-cdk', {
        type: 'release',
        version: fakeVersion('2.0.0'),
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
});
