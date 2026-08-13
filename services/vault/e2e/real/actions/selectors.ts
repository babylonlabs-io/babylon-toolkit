/**
 * Shared Playwright selector helpers for the dapp-driving actions (pegin, borrow, …).
 */
import type { Locator, Page } from "@playwright/test";

import type { BtcWalletId } from "../config";

/**
 * The core-ui fluid `Button`'s stable class — the primary CTA in both the deposit and borrow forms.
 * Used to locate that button independently of its (label-dependent) accessible name.
 */
export const FLUID_CTA_SELECTOR = "button.bbn-btn-fluid";

/**
 * Locate a control by its `data-testid` OR a tolerant fallback `Locator`, resolving to the FIRST match
 * in DOM order (`.or()` is a match-either union, not a testid priority). This works because the testid
 * (added to the src controls) and the fallback target the SAME control: on the current build both match
 * that one element; on a deployed build that predates the testid, only the fallback matches — either way
 * it resolves to that control. Keep each fallback tightly scoped to its own control so a broad fallback
 * can't match an earlier, unrelated element and win the `.first()`. The fallback is a `Locator` (not a
 * name) because it differs per site — `getByRole({name})`, `getByRole().filter({hasText})`, or a raw
 * `page.locator(...)`.
 */
export function firstByTestid(
  page: Page,
  testid: string,
  fallback: Locator,
): Locator {
  return page.locator(testid).or(fallback).first();
}

// ── Deposit entry point ─────────────────────────────────────────────────────────

/**
 * The "Deposit" CTA that opens the deposit form — the entry point for pegin, resume's fresh
 * interrupt, and the just-in-time Bitcoin prompt, so it lives here rather than in each action.
 *
 * `/vaults` carries the testid (VaultsSummaryCard's card action + VaultsEmptyState). The `/`
 * dashboard the runner opens does NOT: its Overview stat-card action renders the same "Deposit"
 * label with no testid (it was dropped when #2184 replaced the v2 shell), so on that route only the
 * tolerant fallback matches. Restoring the testid on the dashboard CTA is the real fix.
 */
const DEPOSIT_BUTTON_TESTID = '[data-testid="deposit-button"]';
/** The CTA's visible label (COPY.overview.depositAction / COPY.vaults.empty.depositAction). */
const DEPOSIT_BUTTON_RX = /^Deposit$/;
export function depositButton(page: Page): Locator {
  return firstByTestid(
    page,
    DEPOSIT_BUTTON_TESTID,
    page.getByRole("button", { name: DEPOSIT_BUTTON_RX }),
  );
}

/**
 * The deposit form's amount input. Doubles as the "the form actually opened" signal: with no Bitcoin
 * wallet connected the Deposit CTA opens the wallet dialog instead (RootLayout's `openDeposit` →
 * `useRequireBtcWallet`), and then this never appears.
 */
const DEPOSIT_AMOUNT_PLACEHOLDER = "0";
export function depositAmountInput(page: Page): Locator {
  return page.getByPlaceholder(DEPOSIT_AMOUNT_PLACEHOLDER).first();
}

// ── Navbar wallet controls ──────────────────────────────────────────────────────
// The navbar renders exactly ONE of these per session state (services/vault/src/components/Wallet/
// Connect.tsx): "Unlock wallet" when connected with a locked BTC extension, "Connect BTC" + the
// wallet menu when Ethereum alone is connected, the wallet menu alone when both are connected, and
// plain "Connect" when disconnected. Each control is a core-ui `ConnectButton`, which defaults to the
// `connect-wallet-button` testid — so the BTC-specific ones carry their own testid, and their
// tolerant fallbacks key on the label rather than that shared default.

/** Plain "Connect" — core-ui `ConnectButton`'s default testid (the disconnected navbar control). */
export const CONNECT_WALLET_TESTID = '[data-testid="connect-wallet-button"]';

const CONNECT_BTC_TESTID = '[data-testid="connect-btc-button"]';
/** The ETH-only session's optional-Bitcoin control label. */
const CONNECT_BTC_RX = /^Connect BTC$/;
export function connectBtcButton(page: Page): Locator {
  return firstByTestid(
    page,
    CONNECT_BTC_TESTID,
    page.getByRole("button", { name: CONNECT_BTC_RX }),
  );
}

const UNLOCK_BTC_TESTID = '[data-testid="unlock-btc-wallet-button"]';
/** COPY.wallet.locked.unlockButton — the connected-but-BTC-locked control label. */
const UNLOCK_BTC_RX = /^Unlock wallet$/;
export function unlockBtcButton(page: Page): Locator {
  return firstByTestid(
    page,
    UNLOCK_BTC_TESTID,
    page.getByRole("button", { name: UNLOCK_BTC_RX }),
  );
}

/**
 * The connected wallet menu's trigger. core-ui's `Menu` clones the trigger (the avatar group) and
 * adds `aria-haspopup="true"`. The header has TWO haspopup triggers — the avatar group and the
 * settings gear — so filter to the one holding the wallet avatar images.
 */
export function walletMenuTrigger(page: Page): Locator {
  return page
    .locator('[aria-haspopup="true"]')
    .filter({ has: page.locator("img.bbn-avatar-img") })
    .first();
}

/** Wallet-menu card headings — core-ui's `WalletMenuCard` renders "<walletType> Wallet". */
export const BITCOIN_WALLET_CARD = "Bitcoin Wallet";
export const ETHEREUM_WALLET_CARD = "Ethereum Wallet";

// ── Wallet dialog (wallet-connector) ────────────────────────────────────────────

/** The chain rows on the dialog's CHAINS screen. */
export const SELECT_BITCOIN_WALLET_TESTID =
  '[data-testid="select-bitcoin-wallet-button"]';
export const SELECT_ETHEREUM_WALLET_TESTID =
  '[data-testid="select-ethereum-wallet-button"]';
/** The CHAINS screen's "Connect" — confirms the session and closes the dialog. */
export const CHAINS_CONNECT_TESTID = '[data-testid="chains-connect-button"]';

/** One BTC wallet's entry on the dialog's WALLETS screen (wallet-connector's `WalletButton`). */
export function btcWalletOption(page: Page, id: BtcWalletId): Locator {
  return page.locator(`[data-testid="wallet-option-${id}"]`);
}

/**
 * Any wallet-list entry — the signal that the dialog is on its WALLETS screen. `open("BTC")` lands
 * straight there, so this is how an action tells "the app asked for a Bitcoin wallet" apart from
 * "the control I clicked did what I expected".
 */
export function walletDialogOption(page: Page): Locator {
  return page.locator('[data-testid^="wallet-option-"]').first();
}

// ── Shared loan-form (Borrow / Repay) selectors ─────────────────────────────────
// The borrow and repay flows drive the SAME components — the `AmountSlider` (numeric input + Max
// button), the "Select asset" picker, and the one `LoanSuccessModal` — so these live here rather than
// being duplicated verbatim in both actions. The parts that genuinely differ (submit testid, success
// title, CTA label taxonomy) stay local to each action.

/** The "Select asset" picker title (COPY.loans.assetSelection.title). Borrow always shows it; repay only
 *  when the position has multiple loans (a single loan routes straight to the form). */
export const ASSET_SELECT_TITLE = "Select asset";
/** Per-row testid prefix in the "Select asset" picker: `asset-select-row-<symbol-lowercase>`. Used both
 *  to target a row by token and to read the token symbol back out of the chosen row's `data-testid`. */
export const ASSET_ROW_TESTID_PREFIX = "asset-select-row-";
/** The AmountSlider's numeric input (`inputmode="decimal"`, placeholder "0"). */
export const AMOUNT_INPUT = 'input[inputmode="decimal"]';
/** The AmountSlider's "Max" button (a <button> whose visible text is "Max"). */
export const MAX_BUTTON_RX = /^max$/i;
/** The CLI amount keyword meaning "click the form's Max button" (`--borrow-amount`/`--repay-amount=max`). */
export const MAX_AMOUNT_KEYWORD = "max";
/** LoanSuccessModal's Done button testid (the borrow + repay variants share the modal). */
export const SUCCESS_DONE_TESTID = '[data-testid="loan-success-done-button"]';
/** LoanSuccessModal's Done button text (COPY.loans.*Success.doneButton) — the tolerant click fallback. */
export const DONE_BUTTON_RX = /^done$/i;
/** The tx-failure callout title (COPY.common.transactionFailedTitle) shown when a borrow/repay tx fails. */
export const TX_FAILED_RX = /transaction failed/i;
