/**
 * Fixed waits/counters for the real-wallet connect flow — named so they're never inline
 * (CLAUDE.md: no magic numbers). Mirrors the connector's tests/e2e/utils/timing.ts philosophy:
 * lengthening a settle is safe, shortening risks flakiness.
 */

/** A dapp step: click a control / wait for an element to appear on the vault UI. */
export const STEP_TIMEOUT_MS = 30_000;
/** The Settings gear / theme toggle to appear when forcing dark mode. */
export const THEME_SETUP_TIMEOUT_MS = 15_000;
/** The wallet menu content to render after clicking the avatar-group trigger. */
export const MENU_OPEN_TIMEOUT_MS = 8_000;

/** Let the connected header settle before the first menu click. */
export const HEADER_SETTLE_MS = 1_500;
/** Let an extension approval popup be handled + the address register in the app. */
export const APPROVAL_WAIT_MS = 6_000;
/** Between theme-toggle clicks while confirming the <html> dark class flipped. */
export const THEME_TOGGLE_SETTLE_MS = 400;

/** Auto-approve loop over an extension popup (MetaMask needs multiple rounds). */
export const APPROVE_ROUNDS = 4;
export const APPROVE_ROUND_MS = 1_500;

/** Read the address from the clipboard after clicking a wallet card's copy button. */
export const CLIPBOARD_POLL = { ATTEMPTS: 8, INTERVAL_MS: 300 } as const;
