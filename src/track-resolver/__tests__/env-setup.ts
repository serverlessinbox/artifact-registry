/**
 * Jest `setupFiles` entry (see jest.config.js).
 *
 * `track-resolver-handler.ts` reads `ARTIFACT_BUCKET_BASE`/`AWS_REGION` at module-load time
 * (top-level `const`s), before any test body runs. These must be set before the module is first
 * required, which `setupFiles` guarantees (it runs before the test framework and test file are
 * loaded), unlike a `beforeAll` in the test file itself.
 */
process.env.ARTIFACT_BUCKET_BASE = 'mailbox-artifacts';
process.env.AWS_REGION = 'us-east-1';
