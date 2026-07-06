/**
 * Fixed waits for real-extension wallet automation — UI-settle delays and poll cadences, the primary
 * levers for flakiness. Centralized and named so they're never inline (CLAUDE.md: no magic numbers).
 *
 * `SETTLE` tiers round the former inline values UP to the nearest step: lengthening a settle is safe,
 * shortening risks flakiness. Reach for the smallest tier that is >= the wait a step actually needs.
 */

/** Let the extensions initialize after `chromium.launchPersistentContext`. */
export const EXTENSION_INIT_MS = 5000;

/** Per-character delay when typing into a field with `pressSequentially`. */
export const TYPE_DELAY_MS = 15;

/** "Let the wallet UI settle after an action" tiers (ms). */
export const SETTLE = {
  KEYSTROKE: 300, // between rapid per-char / per-word entry
  SHORT: 500, // small same-screen transition
  BRIEF: 1000, // a control to enable / a short transition
  MODAL: 1500, // a modal or route to mount
  MEDIUM: 2500, // a screen change
  LONG: 3000, // a heavier import / navigation step
  EXTRA_LONG: 4000, // a slow screen (e.g. onboarding hand-off)
  PROCESSING: 6000, // passcode / wallet-creation processing
} as const;

/** `waitFor` / action timeouts (ms), by magnitude of what is being awaited. */
export const WAIT_FOR = {
  QUICK_MS: 2000, // a brief bounded wait
  ONBOARD_MS: 5000, // MetaMask onboarding-specific waits
  ACTION_MS: 6000, // click / fill on an already-located element
  ELEMENT_MS: 8000, // an element / search result / iframe field to become visible
  ELEMENT_SLOW_MS: 10000, // a slower element (default for the click-by helpers)
  HOME_MS: 20000, // wallet home after full onboarding
} as const;

/** Read the address from the clipboard after clicking a wallet's copy button. */
export const CLIPBOARD_POLL = { ATTEMPTS: 8, INTERVAL_MS: 300 } as const;

/** Poll attempts for OKX to download + apply the English language pack. */
export const ENGLISH_PACK_POLL_ATTEMPTS = 20;
