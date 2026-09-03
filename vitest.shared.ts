/**
 * Per-test timeout shared by the workspace's Vitest suites.
 *
 * 5s (vitest's default) is too tight for a suite whose tests dynamically import
 * heavy mocked packages on a shared CI runner. Raised so a slow runner reports
 * a slow test rather than a failed one. Kept in one place so the suites that
 * need it cannot drift apart.
 */
export const TEST_TIMEOUT_MS = 20_000;
