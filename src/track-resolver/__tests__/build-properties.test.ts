/**
 * Unit tests for `buildTrackResolverProperties` (plan-a, stack-self-update).
 *
 * Pure data builder -- no S3, no CDK. Covers:
 * - Defaults: Project (`serverlessinbox`) and DistTag (`stable`) fall back when omitted.
 * - Explicit values: every field passed through verbatim, PascalCase keys.
 */

import { DEFAULT_PROJECT, DEFAULT_DIST_TAG } from '../../utils/artifact-key';
import { buildTrackResolverProperties } from '../build-properties';

describe('buildTrackResolverProperties', () => {
  it('applies Project/DistTag defaults when omitted', () => {
    const result = buildTrackResolverProperties({ package: 'mailbox-go', track: 'v1' });

    expect(result).toEqual({
      Project: DEFAULT_PROJECT,
      Package: 'mailbox-go',
      Track: 'v1',
      DistTag: DEFAULT_DIST_TAG,
    });
  });

  it('applies exact string defaults (serverlessinbox / stable)', () => {
    const result = buildTrackResolverProperties({ package: 'mailbox-go', track: 'v1' });

    expect(result).toEqual({
      Project: 'serverlessinbox',
      Package: 'mailbox-go',
      Track: 'v1',
      DistTag: 'stable',
    });
  });

  it('passes through explicit project/track/distTag verbatim', () => {
    const result = buildTrackResolverProperties({
      project: 'acme',
      package: 'mailbox-webmail-ui',
      track: 'v1.2',
      distTag: 'beta',
    });

    expect(result).toEqual({
      Project: 'acme',
      Package: 'mailbox-webmail-ui',
      Track: 'v1.2',
      DistTag: 'beta',
    });
  });

  it('defaults only the omitted fields when project is explicit but distTag is not', () => {
    const result = buildTrackResolverProperties({
      project: 'acme',
      package: 'mailbox-go',
      track: 'v2',
    });

    expect(result).toEqual({
      Project: 'acme',
      Package: 'mailbox-go',
      Track: 'v2',
      DistTag: DEFAULT_DIST_TAG,
    });
  });
});
