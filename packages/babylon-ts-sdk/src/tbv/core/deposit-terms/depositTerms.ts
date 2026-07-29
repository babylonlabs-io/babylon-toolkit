import type { BitcoinWallet } from "../../../shared/wallets/interfaces";

// Field docs use /** */ so they survive into the emitted .d.ts — the published
// package is the only contract the external provider author (#2109) sees.

export interface DepositTermsVaultGroup {
  /** 0-based; equals the group's position (groups are ascending by vout). */
  readonly htlcVout: number;
  /** x-only hex (64 chars), as validated on-chain upstream. */
  readonly vaultProviderPk: string;
  /** sats */
  readonly vaultAmount: bigint;
  /** sats; floor(vaultAmount * commissionBps / 10_000). */
  readonly commissionFee: bigint;
  /** sats; the same value for every vault. */
  readonly depositorClaimValue: bigint;
  /** sats; the minimum PegIn fee for this graph version. */
  readonly peginMaxFee: bigint;
}

export interface DepositTerms {
  /**
   * sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
   * rate. An approving wallet bounds each payout's fee at baseFeeRate x a
   * conservative vsize estimate (v22 §4.9.7.1) — pass the exact graph rate,
   * not an inflated ceiling.
   */
  baseFeeRate: bigint;
  /** Vault-UTXO CSV timelock (blocks). */
  peginCsvTimelock: number;
  /**
   * Payout timelock on the Assert transaction's output 0; comes from the same
   * protocol param (timelockAssert) as peginCsvTimelock.
   */
  payoutTimelock: number;
  /** HTLC refund CSV timelock (blocks). */
  htlcRefundTimelock: number;
  /**
   * 64-char hex in display order. A device-wire encoder must byte-reverse it to
   * the little-endian form the device recomputes and compares against.
   */
  prepeginTxid: string;
  /** sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this). */
  prepeginMaxFee: bigint;
  /**
   * x-only hex. Sorted ascending by the upstream on-chain validation
   * (validateOnChainParticipantKeys); the builder passes them through
   * unasserted — the device rejects unsorted lists at intent load.
   */
  keeperPks: readonly string[];
  /**
   * x-only hex, sorted ascending upstream independently of keeperPks (same
   * pass-through contract). Universal challengers only — the full graph
   * challenger set is keeperPks ∪ challengerPks (vault keepers are the local
   * challengers).
   */
  challengerPks: readonly string[];
  /** Per-vault groups, ordered by ascending htlcVout. */
  vaults: readonly DepositTermsVaultGroup[];
}

/**
 * Implemented only by depositor-approval wallets (e.g. a Ledger vault provider).
 * Either a class field or a prototype method works — the deposit flow spreads
 * the wallet object but forwards this method explicitly at every wrapper site.
 *
 * Seam invariant: never call deriveContextHash between approveDepositTerms and
 * the last terms-bound signature of a connection — deriving while an intent is
 * loaded nullifies it on-device. Design: the SDK owns approval (mirrors its
 * deriveContextHash/signPsbts orchestration); provider-internal and app-driven
 * placements were rejected.
 */
export interface DepositTermsApprover {
  approveDepositTerms(terms: DepositTerms): Promise<void>;
}

/** True when the wallet implements {@link DepositTermsApprover.approveDepositTerms}. */
export function supportsDepositApproval(
  wallet: BitcoinWallet,
): wallet is BitcoinWallet & DepositTermsApprover {
  return typeof (wallet as Partial<DepositTermsApprover>).approveDepositTerms === "function";
}

/**
 * Spreadable forward of `approveDepositTerms` for wallet-wrapper objects.
 * Object spread drops prototype methods, so every `{...wallet}` wrapper site
 * must re-attach the capability explicitly: `...forwardDepositApproval(wallet)`.
 */
export function forwardDepositApproval(
  wallet: BitcoinWallet,
): Partial<DepositTermsApprover> {
  return supportsDepositApproval(wallet)
    ? { approveDepositTerms: (terms) => wallet.approveDepositTerms(terms) }
    : {};
}

export interface BuildDepositTermsInputs {
  protocolFeeRate: bigint;
  timelockPegin: number;
  timelockRefund: number;
  prepeginTxid: string;
  prepeginMaxFee: bigint;
  vaultProviderPk: string;
  keeperPks: readonly string[];
  challengerPks: readonly string[];
  commissionBps: number;
  vaultAmounts: readonly bigint[];
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}
