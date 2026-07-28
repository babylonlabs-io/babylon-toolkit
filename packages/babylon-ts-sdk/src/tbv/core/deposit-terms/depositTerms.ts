import type { BitcoinWallet } from "../../../shared/wallets/interfaces";

export interface DepositTermsVaultGroup {
  htlcVout: number; // 0-based; equals the group's position (groups are ascending by vout)
  vaultProviderPk: string; // x-only lowercase hex (64 chars)
  vaultAmount: bigint; // sats
  // sats; floor(vaultAmount * commissionBps / 10_000). Omitted when the
  // builder wasn't given a commissionBps (see BuildDepositTermsInputs).
  commissionFee?: bigint;
  depositorClaimValue: bigint; // sats; the same value for every vault
  peginMaxFee: bigint; // sats; the minimum PegIn fee for this graph version
}

export interface DepositTerms {
  // The tx-graph fee rate (protocolFeeRate), NOT the mempool funding rate. A
  // depositor-approval wallet checks each payout's fee against this exact value.
  baseFeeRate: bigint; // sat/vB
  peginCsvTimelock: number; // vault-UTXO CSV timelock (blocks)
  // Assert:0 payout timelock; comes from the same protocol param as peginCsvTimelock.
  payoutTimelock: number;
  htlcRefundTimelock: number; // HTLC refund CSV timelock (blocks)
  // 64-char hex in display order. A device-wire encoder must byte-reverse it to the
  // little-endian form the device recomputes and compares against.
  prepeginTxid: string;
  prepeginMaxFee: bigint; // sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this)
  keeperPks: string[]; // x-only hex, sorted ascending
  // x-only hex, sorted ascending independently of keeperPks. Universal challengers
  // only — the full graph challenger set is keeperPks ∪ challengerPks (vault
  // keepers are the local challengers).
  challengerPks: string[];
  vaults: DepositTermsVaultGroup[]; // per-vault groups, ordered by ascending htlcVout
}

// Implemented only by depositor-approval wallets (e.g. a Ledger vault provider). The
// provider must be a class field (the deposit flow spreads the wallet object).
export interface DepositTermsApprover {
  approveDepositTerms(terms: DepositTerms): Promise<void>;
}

// Seam invariant: never call deriveContextHash between approveDepositTerms and the
// last terms-bound signature of a connection — deriving mid-approval nullifies it.
// Design: mirrors the SDK's existing deriveContextHash/signPsbts orchestration —
// the SDK owns approval by design; provider-internal and app-driven placements were rejected.
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
  // Omitted -> built terms carry no per-vault commissionFee (see DepositTermsVaultGroup).
  commissionBps?: number;
  vaultAmounts: readonly bigint[];
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}
