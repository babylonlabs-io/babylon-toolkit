import type { BitcoinWallet } from "../../../shared/wallets/interfaces";

// Field docs use /** */ so they survive into the emitted .d.ts — the published
// package is the only contract the external provider author (#2109) sees.

export interface DepositTermsVaultGroup {
  /** 0-based; equals the group's position (groups are ascending by vout). */
  htlcVout: number;
  /** x-only lowercase hex (64 chars). */
  vaultProviderPk: string;
  /** sats */
  vaultAmount: bigint;
  /**
   * sats; floor(vaultAmount * commissionBps / 10_000). Omitted when the
   * builder wasn't given a commissionBps (see BuildDepositTermsInputs).
   */
  commissionFee?: bigint;
  /** sats; the same value for every vault. */
  depositorClaimValue: bigint;
  /** sats; the minimum PegIn fee for this graph version. */
  peginMaxFee: bigint;
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
  /** Assert:0 payout timelock; comes from the same protocol param as peginCsvTimelock. */
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
  /** x-only hex, sorted ascending. */
  keeperPks: string[];
  /**
   * x-only hex, sorted ascending independently of keeperPks. Universal
   * challengers only — the full graph challenger set is keeperPks ∪
   * challengerPks (vault keepers are the local challengers).
   */
  challengerPks: string[];
  /** Per-vault groups, ordered by ascending htlcVout. */
  vaults: DepositTermsVaultGroup[];
}

/**
 * Implemented only by depositor-approval wallets (e.g. a Ledger vault provider).
 * Either a class field or a prototype method works — the deposit flow spreads
 * the wallet object but forwards this method explicitly at every wrapper site.
 */
export interface DepositTermsApprover {
  approveDepositTerms(terms: DepositTerms): Promise<void>;
}

/**
 * Seam invariant: never call deriveContextHash between approveDepositTerms and
 * the last terms-bound signature of a connection — deriving mid-approval
 * nullifies it. Design: mirrors the SDK's existing deriveContextHash/signPsbts
 * orchestration — the SDK owns approval by design; provider-internal and
 * app-driven placements were rejected.
 */
export function supportsDepositApproval(
  wallet: BitcoinWallet,
): wallet is BitcoinWallet & DepositTermsApprover {
  return typeof (wallet as Partial<DepositTermsApprover>).approveDepositTerms === "function";
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
  /** Omitted -> built terms carry no per-vault commissionFee (see DepositTermsVaultGroup). */
  commissionBps?: number;
  vaultAmounts: readonly bigint[];
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}
