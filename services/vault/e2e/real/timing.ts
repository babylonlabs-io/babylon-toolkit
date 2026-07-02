/**
 * Fixed waits/counters for the real-wallet connect flow — named so they're never inline
 * (CLAUDE.md: no magic numbers). Mirrors the connector's tests/e2e/utils/timing.ts philosophy:
 * lengthening a settle is safe, shortening risks flakiness.
 */

/** A dapp step: click a control / wait for an element to appear on the vault UI. */
export const STEP_TIMEOUT_MS = 30_000;
/** The wallet menu content to render after clicking the avatar-group trigger. */
export const MENU_OPEN_TIMEOUT_MS = 8_000;

/** Let the connected header settle before the first menu click. */
export const HEADER_SETTLE_MS = 1_500;
/** Let an extension approval popup be handled + the address register in the app. */
export const APPROVAL_WAIT_MS = 6_000;

/** Auto-approve loop over an extension popup (MetaMask needs multiple rounds). */
export const APPROVE_ROUNDS = 6;
export const APPROVE_ROUND_MS = 1_500;
/**
 * Per-click actionability budget inside the approve loop. Bounded (not the 30s default) so that a
 * control still disabled — e.g. OneKey's Approve while its "Proceed at my own risk" consent checkbox
 * is unticked — fails fast and the next round retries, instead of blocking the whole loop.
 */
export const APPROVE_CLICK_TIMEOUT_MS = 3_000;
