/**
 * When the depositor-claim reserve may be reclaimed.
 *
 * Every peg-in reserves `depositorClaimValue` — roughly 33k sats — at PegIn
 * vout 1 to fund the depositor's own `claim_tx`. On the happy path the vault
 * provider claims from its own wallet instead, and that reserve is never spent
 * by anyone. This module decides when the app may offer to sweep it back.
 *
 * A pure predicate over already-fetched data, mirroring
 * `computeDepositPollingResult`: the reads live in the polling context, the
 * decision lives here where it can be tested exhaustively.
 *
 * @module models/reclaimEligibility
 */

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { COPY } from "@/copy";

/**
 * Confirmations required on the Payout before the reserve is offered.
 *
 * Six is the conventional deep-confirmation depth; the point is that a reorg
 * unwinding the Payout must not leave the depositor having already destroyed
 * the recourse graph that Payout made redundant.
 */
export const RECLAIM_MIN_PAYOUT_CONFIRMATIONS = 6;

/**
 * Vout of the vault output in the PegIn transaction. Its spend is the Payout —
 * the signal this gate turns on.
 */
export const PEGIN_VAULT_VOUT = 0;

/** Spend status of a single PegIn output, as observed on Bitcoin. */
export interface OutpointSpend {
  spent: boolean;
  confirmed: boolean;
  /** Height of the block containing the spending tx, when confirmed. */
  blockHeight?: number;
}

/** An esplora `/outspend` response, as `getOutspend` returns it: unvalidated. */
export interface RawOutspend {
  spent?: boolean;
  status?: { confirmed?: boolean; block_height?: number };
}

/**
 * Coerce a chain height — a spend's `block_height` or the chain tip — to a
 * value this module can do arithmetic on, or `undefined`.
 *
 * Both operands of `tipHeight - blockHeight + 1` need this, and for the same
 * reason: neither arrives validated. The SDK's `getOutspend` returns the
 * parsed JSON body verbatim, so `block_height: number | undefined` describes
 * the declared type rather than the value, and a `null`, a numeric string or a
 * negative height all reach here as-is. The mempool endpoint is configurable,
 * so a self-hosted or proxied response is untrusted on both halves.
 *
 * `Number.isSafeInteger` rather than `Number.isInteger` is load-bearing: a
 * finite-but-unsafe height such as `1e20` satisfies `isInteger`, and as a tip
 * it yields a confirmation depth around `1e20` that clears any threshold.
 * Real heights sit near 9e5 against a 9e15 bound, so nothing legitimate is
 * excluded.
 */
export function normalizeChainHeight(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Normalise an esplora outspend response into an `OutpointSpend`.
 *
 * `spent` and `confirmed` compare strictly against `true`, so anything
 * malformed reads as "not spent" — the fail-closed direction. `blockHeight` is
 * the only field consumed arithmetically, which is why it needs the coercion
 * above rather than a comparison.
 */
export function toOutpointSpend(res: RawOutspend): OutpointSpend {
  return {
    spent: res.spent === true,
    confirmed: res.spent === true && res.status?.confirmed === true,
    blockHeight: normalizeChainHeight(res.status?.block_height),
  };
}

export interface ReclaimEligibilityInput {
  /**
   * Live `BTCVaultStatus` from the contract. Necessary but never sufficient —
   * see the note below on why this cannot be the gate.
   */
  onChainStatus: number | undefined;
  /** Spend status of `peginTxid:0` — the vault UTXO. */
  payoutSpend: OutpointSpend | undefined;
  /** Spend status of `peginTxid:1` — the reserve itself. */
  reserveSpend: OutpointSpend | undefined;
  /**
   * The Bitcoin tip height **the spends above were observed against**, not the
   * current one.
   *
   * Those are two different numbers whenever a poll carries a previous
   * observation forward past a failed read, and pairing a fresh tip with stale
   * spend data would let confirmations accrue on a Payout nobody is watching
   * any more. `useReclaimStatus` stamps each status with the tip of the tick
   * that produced it for exactly this reason.
   */
  tipHeight: number | undefined;
  /** Whether the vault belongs to the connected wallet. */
  isOwnedByWallet: boolean;
  /** Whether the connected BTC wallet is the Ledger vault app. */
  isLedgerWallet: boolean;
  /** Whether protocol status has paused exits. */
  isWithdrawBlocked: boolean;
  /**
   * True when this session broadcast a sweep for this vault whose spend the
   * poll has not observed yet. Bridges the ≤60s poll interval so the button
   * disables the moment the depositor confirms.
   */
  isReclaimInFlight: boolean;
}

export type ReclaimEligibility =
  /** Offer the action. */
  | { type: "available" }
  /**
   * A sweep is broadcast but not yet confirmed. The row keeps its figure and
   * its button, with the button disabled and the status reading "Reclaiming" —
   * mirroring how the refund path shows "Refunding".
   */
  | { type: "reclaiming" }
  /**
   * The reclaim is this row's action but is not performable; the row shows a
   * disabled control explaining why.
   */
  | { type: "blocked"; tooltip: string }
  /** Not this row's action at all — render nothing. */
  | { type: "absent" };

/**
 * Decide whether the reserve may be swept.
 *
 * > ⚠️ **The gate is on Bitcoin, not Ethereum, and that is deliberate.**
 * >
 * > The obvious implementation — offer it once the contract says `Redeemed` —
 * > is wrong. `RedeemLogic.redeemForDepositor` sets that status *before* any
 * > Bitcoin claim happens, and emits `VaultClaimableBy` for the vault provider
 * > key *and* the depositor key. That is an authorization issued to both
 * > parties, not a record of who acted; no on-chain state distinguishes them.
 * >
 * > The reserve is the only input to the depositor's pre-signed `claim_tx`, and
 * > every downstream Assert / Payout / NoPayout signature commits to that tx's
 * > txid. There is no re-funding path. Sweeping it while the vault is still
 * > live permanently destroys the depositor's recourse.
 * >
 * > So the real gate is `peginTxid:0` spent and deeply confirmed: the vault
 * > UTXO is consumed, a Payout landed, and the claim graph can no longer serve
 * > any purpose. Do not "simplify" this back to a status read.
 *
 * Fails closed: any read still missing or errored yields `absent`.
 */
export function getReclaimEligibility(
  input: ReclaimEligibilityInput,
): ReclaimEligibility {
  const {
    onChainStatus,
    payoutSpend,
    reserveSpend,
    tipHeight,
    isOwnedByWallet,
    isLedgerWallet,
    isWithdrawBlocked,
    isReclaimInFlight,
  } = input;

  // Necessary precondition. A vault that is not redeemed on Ethereum has no
  // business offering this, whatever Bitcoin shows.
  if (onChainStatus !== OnChainBtcVaultStatus.REDEEMED)
    return { type: "absent" };

  // Not the connected wallet's vault: the sweep is keyed on the connected
  // wallet's pubkey, so there is nothing this wallet could sign.
  if (!isOwnedByWallet) return { type: "absent" };

  // Any read not yet in hand — or not usable as a height — leaves the action
  // hidden rather than offered.
  if (
    !payoutSpend ||
    !reserveSpend ||
    normalizeChainHeight(tipHeight) === undefined
  ) {
    return { type: "absent" };
  }

  // The gate. An unspent vault UTXO means the peg-out has not settled on
  // Bitcoin and the depositor's claim right still matters.
  const payoutSettled = isPayoutSettled(payoutSpend, tipHeight);

  if (reserveSpend.spent) {
    // Spent but not yet mined, on a vault that had passed the gate: this is a
    // sweep in flight. Only `<D> OP_CHECKSIG` can spend the output, so the
    // spender is provably the depositor, and once the payout has settled the
    // protocol claim_tx has no purpose left — so attributing it to a reclaim
    // is right in every realistic case.
    if (!reserveSpend.confirmed && payoutSettled) {
      return { type: "reclaiming" };
    }
    // Confirmed spend (or a spend on a vault that never passed the gate, which
    // would be a claim_tx): nothing left to reclaim, and nothing to attribute.
    return { type: "absent" };
  }

  // A sweep we broadcast this session, before the 60s poll has observed it.
  // Without this the row would keep offering an enabled button for up to a
  // minute after the user confirmed.
  if (isReclaimInFlight && payoutSettled) return { type: "reclaiming" };

  if (!payoutSettled) return { type: "absent" };

  // Past this point the reserve is genuinely reclaimable and the depositor
  // should be told so even when they cannot act right now.

  // Reclaim is an exit, so it follows withdraw's pause semantics.
  if (isWithdrawBlocked) {
    return { type: "blocked", tooltip: COPY.reclaim.blocked.protocolPaused };
  }

  // The Ledger vault app cannot sign this transaction. Its firmware routes any
  // 34-byte `<D> OP_CHECKSIG` tapleaf to the claim validator
  // (app-babylon-vault `src/sign_psbt_validate.c`), which hard-requires the
  // protocol claim_tx shape of 1 input and 2 outputs; a 1-in/1-out sweep is
  // rejected on the output count before any device I/O.
  //
  // Deliberately reclaim-specific: refund *is* reachable on the device
  // (`_validate_display_refund`), so this must not become "no Bitcoin actions
  // on Ledger". Supporting reclaim needs a new firmware validator with its own
  // approval screen, plus host-side work in babylon-ledger-vault-signer.
  //
  // Shown as blocked rather than hidden so Ledger users still learn the
  // reserve exists and can sweep it from another wallet.
  if (isLedgerWallet) {
    return { type: "blocked", tooltip: COPY.reclaim.blocked.ledgerUnsupported };
  }

  return { type: "available" };
}

/**
 * Whether the Payout has landed on Bitcoin and settled deeply enough to make
 * the depositor's recourse graph redundant.
 *
 * This is *the* safety condition — sweeping the reserve before it holds
 * destroys recovery material that cannot be rebuilt. Exported so the pre-sign
 * re-check in `services/vault/vaultReclaimService` enforces the same predicate
 * the row is rendered from, rather than a second copy of it that can drift.
 *
 * Fails closed on every missing input.
 */
export function isPayoutSettled(
  payoutSpend: OutpointSpend | undefined,
  tipHeight: number | undefined,
): boolean {
  const tip = normalizeChainHeight(tipHeight);
  if (!payoutSpend || tip === undefined) return false;
  return (
    payoutSpend.spent &&
    payoutSpend.confirmed &&
    payoutConfirmations(payoutSpend, tip) >= RECLAIM_MIN_PAYOUT_CONFIRMATIONS
  );
}

/**
 * Confirmation depth of the Payout, counting the containing block as one.
 *
 * A spend confirmed but missing a usable height is treated as one confirmation
 * — enough to be real, not enough to clear the deep-confirmation bar — so a
 * partial or malformed esplora response delays the offer instead of waving it
 * through. The height is re-normalised here rather than trusted from the
 * caller: this function is the safety control, and it should not be correct
 * only because some mapper upstream happened to be.
 */
function payoutConfirmations(
  payoutSpend: OutpointSpend,
  tipHeight: number,
): number {
  const blockHeight = normalizeChainHeight(payoutSpend.blockHeight);
  if (blockHeight === undefined) return 1;
  return tipHeight - blockHeight + 1;
}
