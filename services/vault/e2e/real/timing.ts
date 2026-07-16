/**
 * Fixed waits/counters for the real-wallet connect flow — named so they're never inline
 * (CLAUDE.md: no magic numbers). Mirrors the connector's tests/e2e/utils/timing.ts philosophy:
 * lengthening a settle is safe, shortening risks flakiness.
 */

/** Milliseconds per second — for converting a `*_MS` budget to seconds in a user-facing message. */
export const MS_PER_SECOND = 1000;

/** A dapp step: click a control / wait for an element to appear on the vault UI. */
export const STEP_TIMEOUT_MS = 30_000;
/** The wallet menu content to render after clicking the avatar-group trigger. */
export const MENU_OPEN_TIMEOUT_MS = 8_000;

/** Let the connected header settle before the first menu click. */
export const HEADER_SETTLE_MS = 1_500;
/** Let an extension approval popup be handled + the address register in the app. */
export const APPROVAL_WAIT_MS = 6_000;

/**
 * The connected state (the header "deposit" CTA) to appear after finalizing the connect. Generous
 * because MetaMask can insert an EXTRA approval after the initial connect — a "Review permissions / Use
 * your enabled networks" prompt — which must be confirmed before the app flips to connected. We poll +
 * sweep approvals across this window so that late/reused-window prompt is clicked (a single one-shot
 * waitFor would just time out with the prompt left hanging).
 */
export const CONNECT_STATE_TIMEOUT_MS = 60_000;
/** Poll cadence for the connected-state wait (each tick re-sweeps any open approval popup). */
export const CONNECT_STATE_POLL_MS = 1_500;

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
 * How many times to click a step-machine "Transaction failed → Retry" before giving up. A recoverable
 * failure here is almost always the intermittent public-Sepolia RPC gas-estimation flake (a null
 * `gasLimit` on an activation/step tx), which clears on a retry — the app offers a Retry button for
 * exactly this. A genuinely-failing tx exhausts these retries and the run aborts with the callout
 * instead of spinning to the multi-hour step-machine budget.
 */
export const PEGIN_TX_FAILURE_RETRY_LIMIT = 3;
/**
 * The activated vault to surface as collateral on the dashboard after "Go to Dashboard" — it appears
 * optimistically ("Activating collateral…") but can lag the indexer catching up.
 */
export const DASHBOARD_VAULT_TIMEOUT_MS = 60_000;

// ── borrow ────────────────────────────────────────────────────────────────────
/**
 * The dashboard "Borrow" button to become enabled after landing on the dashboard. It's gated on
 * `hasCollateral` (the position's on-chain collateral > 0); a JUST-activated vault (pegin-first) takes
 * a little time to propagate into that read, so the button can be briefly disabled right after
 * "Go to Dashboard". Generous so a fresh activation isn't mistaken for "no collateral" (a hard fail);
 * a reuse run already had its collateral gated by run.ts, so the button is enabled well within this.
 */
export const BORROW_BUTTON_ENABLE_TIMEOUT_MS = 180_000;
/**
 * After a pegin-first activation, how long to wait for the freshly-activated vault's collateral to
 * register on-chain (the adapter position's BTC amount rising above the pre-pegin baseline) before
 * entering the borrow amount. Activation confirms on Sepolia in seconds and `getPosition` reads that
 * on-chain state directly, so this is usually quick; generous to absorb a slow read. Non-fatal on
 * timeout — the borrow form's own CTA wait still gates the amount.
 */
export const FRESH_COLLATERAL_TIMEOUT_MS = 180_000;
/** Poll cadence for the post-activation collateral-settle wait (a light on-chain `getPosition` read). */
export const FRESH_COLLATERAL_POLL_MS = 3_000;
/**
 * The borrow form's submit button to become the enabled "Borrow" after entering an amount — it relabels
 * through "Enter an amount" / "Refreshing position…" while the oracle price + position settle. Generous
 * because in a pegin-first run the just-activated vault's collateral has to propagate into the form's
 * on-chain position read before a larger amount clears the max ("Amount exceeds maximum" is transient
 * until then). A genuinely-too-large amount fails at this deadline with the form's callout.
 */
export const BORROW_CTA_ENABLE_TIMEOUT_MS = 150_000;
/**
 * One borrow ETH transaction to confirm on Sepolia (approver confirms the MetaMask pop-up → the app
 * shows the "Borrow successful" screen). A single draw with no ERC-20 approval, so a minute is ample;
 * a stuck tx fails the run (trace captured) instead of hanging.
 */
export const BORROW_TX_TIMEOUT_MS = 90_000;

// ── repay ─────────────────────────────────────────────────────────────────────
/**
 * The dashboard "Repay" button to become visible + enabled. It only renders when `hasLoans` and is
 * enabled once connected; a loan created earlier in the SAME session (borrow-first) takes a moment to
 * propagate into that read, so we poll rather than fail on the first check. A reuse run's loan is
 * already on-chain, so the button is ready almost immediately.
 */
export const REPAY_BUTTON_ENABLE_TIMEOUT_MS = 180_000;
/**
 * The repay form's submit button to become the enabled "Repay" after entering an amount — it settles
 * through "Enter an amount" while the wallet balance + debt load (and, for a Max intent, a submit-time
 * refetch). No collateral-propagation transient (unlike borrow), so shorter; a genuinely-blocked amount
 * surfaces its instant-fail label (e.g. "Amount exceeds debt") well within this.
 */
export const REPAY_CTA_ENABLE_TIMEOUT_MS = 90_000;
/**
 * The repay transaction(s) to confirm on Sepolia. Unlike borrow this can be TWO sequential txs — an
 * ERC-20 approve of the debt token to the adapter (only when the current allowance is insufficient),
 * then the repay — with the CTA reading "Processing…" across both. Longer than the borrow budget to
 * absorb two confirmations; a stuck tx fails the run (trace captured) instead of hanging.
 */
export const REPAY_TX_TIMEOUT_MS = 120_000;
/** Poll cadence for the on-chain "debt fell" post-condition check after the success screen. */
export const REPAY_VERIFY_POLL_MS = 3_000;

// ── withdraw ───────────────────────────────────────────────────────────────────
/**
 * The Collateral "⋯" actions menu to appear + enable on the dashboard. It's only RENDERED when the
 * position holds collateral, so after a chained repay/borrow it can lag while the position settles;
 * generous so a slow-to-render menu isn't mistaken for "no collateral" (a hard fail).
 */
export const WITHDRAW_MENU_TIMEOUT_MS = 30_000;
/** The withdraw selection modal to render after clicking the "Withdraw" menu item. */
export const WITHDRAW_MODAL_TIMEOUT_MS = 15_000;
/**
 * A withdraw CTA (the modal's "Withdraw {amount}" confirm, then the Review "Confirm") to enable after a
 * selection is made — the Review screen recomputes the projected health factor + fees first. Generous so
 * a slow risk-param read isn't mistaken for a blocked withdrawal; a genuine HF breach fails fast via the
 * block warning.
 */
export const WITHDRAW_CTA_ENABLE_TIMEOUT_MS = 90_000;
/**
 * The single withdraw ETH transaction to confirm on Sepolia (the approver confirms the MetaMask pop-up →
 * the app shows "Withdrawal initiated"). One tx, so a minute-plus is ample; a stuck tx fails the run
 * (trace captured) instead of hanging. Reused as the on-chain collateral-fell verification budget.
 */
export const WITHDRAW_TX_TIMEOUT_MS = 90_000;
/** Poll cadence for the post-withdraw on-chain collateral-fell check (a light `getPosition` read). */
export const WITHDRAW_VERIFY_POLL_MS = 3_000;

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
