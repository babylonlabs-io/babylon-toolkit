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

// ── pegin: deposit form ──────────────────────────────────────────────────────
/** Let the deposit form recompute (fees, validation) after each input; also the CTA-poll cadence. */
export const FORM_SETTLE_MS = 1_000;
/** The vault-provider list to render after expanding the accordion. */
export const PROVIDER_LIST_TIMEOUT_MS = 15_000;
/**
 * The form CTA to become the enabled "Deposit" — it relabels through "Enter an amount" → "Select a
 * vault provider" → "Calculating fees…" → "Checking for inscriptions…" as fee estimation + the
 * inscription check complete, so this must outlast those async passes.
 */
export const DEPOSIT_CTA_ENABLE_TIMEOUT_MS = 90_000;
/**
 * The two-vault split option to become selectable after entering a split-eligible amount: the form
 * fetches Aave risk params + runs the allocation ("Computing allocation…") before the "Two-vault split"
 * row flips from `aria-disabled` to enabled. Generous so a slow risk-param fetch isn't mistaken for a
 * too-low amount (which is a hard fail).
 */
export const SPLIT_ALLOCATION_TIMEOUT_MS = 30_000;

// ── pegin: step machine ──────────────────────────────────────────────────────
/**
 * Overall budget for the 15-step signing machine. It spans multiple on-chain gates — Pre-PegIn
 * inclusion (~10 min/block), the WOTS-key gate (~20 min), and the payout gate (~3 min) — so a real
 * peg-in runs 30 min–2 hr. Budgeted generously; the action imposes NO short per-step timeout.
 */
export const PEGIN_STEP_MACHINE_BUDGET_MS = 2.5 * 60 * 60 * 1_000;
/** How often to poll the progress UI (advance the step log, handle the Activate/Skip dapp gates). */
export const PEGIN_POLL_INTERVAL_MS = 3_000;
/**
 * The activated vault to surface as collateral on the dashboard after "Go to Dashboard" — it appears
 * optimistically ("Activating collateral…") but can lag the indexer catching up.
 */
export const DASHBOARD_VAULT_TIMEOUT_MS = 60_000;

// ── sign-conformance (per-wallet signing replay) ─────────────────────────────
/**
 * Budget for one signing call to resolve (popup open → approver confirms → signature returned). A
 * `signPsbts` of 9 can fan out to several sequential pop-ups, so this is generous; a stuck call fails
 * the fixture (its pop-up DOM is already snapshotted) instead of hanging the run.
 */
export const SIGN_CALL_TIMEOUT_MS = 90_000;
/**
 * Wait for a wallet's approval UI to render before the first approve attempt. OKX parses the PSBT(s)
 * before showing its Confirm — unlike UniSat, which is instant — so this must be generous (the active
 * approval driver then keeps polling, so a slower render is still handled up to SIGN_CALL_TIMEOUT_MS).
 */
export const POPUP_OPEN_WAIT_MS = 5_000;
/** Let the dapp settle any post-connection navigation before driving direct provider sign calls. */
export const POST_CONNECT_SETTLE_MS = 5_000;
