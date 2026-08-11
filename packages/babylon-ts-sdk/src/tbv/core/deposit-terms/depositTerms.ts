import type { BitcoinWallet } from "../../../shared/wallets/interfaces";

// Field docs use /** */ so they survive into the emitted .d.ts — the published
// package is the only contract the external provider author (#2109) sees.

export interface DepositTermsVaultGroup {
  /** 0-based; equals the group's position (groups are ascending by vout). */
  readonly htlcVout: number;
  /** x-only hex (64 chars), as validated on-chain upstream. */
  readonly vaultProviderBtcPubkey: string;
  /** sats */
  readonly peginAmount: bigint;
  /**
   * sats; the MAXIMUM commission the depositor accepts —
   * floor(peginAmount * maxAcceptableCommissionBps / 10_000), the same
   * ceiling the registration calldata carries. An approving wallet MUST
   * enforce the VP payout commission output `<= commissionFee` (e.g. the
   * Ledger vault app does, firmware >= c8db53e), and every commission the
   * contract admits stays under this ceiling (floor is monotonic in bps),
   * so no contract-admitted deposit can be refused at payout. The actual
   * stamped commission may be lower. Display the quoted value in UI, not this.
   */
  readonly commissionFee: bigint;
  /** sats; the same value for every vault. */
  readonly depositorClaimValue: bigint;
  /**
   * sats; the cap an approving wallet enforces on the PegIn tx fee. Equals
   * the graph's exact (minimum) PegIn fee, which is deterministic — so the
   * cap is satisfied exact-by-construction.
   */
  readonly peginMaxFee: bigint;
}

/**
 * Field names follow btc-vault vocabulary (the protocol source of truth);
 * a device-wire encoder maps them to its intent fields (e.g. the Ledger TLV:
 * protocolFeeRate -> base_fee_rate, timelockPegin -> pegin_csv_timelock,
 * timelockAssert -> payout_timelock, peginAmount -> vault_amount).
 */
export interface DepositTerms {
  /**
   * btc-vault tx-graph version (`vaultCoreVersion`) these terms describe —
   * the vault's stamped on-chain version for resumes, the chain's
   * `activeVaultCoreVersion` for fresh deposits. It selects the PegIn shape
   * an approving wallet must expect: v1 = 2 outputs, no anchor; v2 = TRUC
   * nVersion 3, 3 outputs with a 240-sat P2A anchor at vout 2, and an
   * Assert OP_RETURN marker that raises the claim value
   * (btc-vault `transactions/pegin.rs`, `assert_marker.rs`). A provider that
   * supports only one shape MUST reject the others here rather than
   * mis-validating the PSBTs later.
   */
  vaultCoreVersion: number;
  /**
   * sat/vB; the tx-graph fee rate (protocolFeeRate), NOT the mempool funding
   * rate. Approving wallets bound each payout's fee against this rate —
   * pass the exact graph rate, not an inflated ceiling.
   */
  protocolFeeRate: bigint;
  /** Vault-UTXO CSV timelock (blocks). */
  timelockPegin: number;
  /**
   * btc-vault `timelock_assert` (t2) — the CSV on Assert output 0. Its own
   * param, though production derives it and `timelockPegin` from one value.
   */
  timelockAssert: number;
  /** HTLC refund CSV timelock (blocks). */
  timelockRefund: number;
  /**
   * 64-char hex in display order. A device-wire encoder may need the
   * little-endian form — some hardware byte-compares it against
   * PSBT_IN_PREVIOUS_TXID rather than recomputing the txid.
   */
  prepeginTxid: string;
  /** sats; the funded Pre-PegIn fee (an approving wallet caps the signed fee at this). */
  prepeginMaxFee: bigint;
  /**
   * x-only hex. Sorted ascending by the upstream on-chain validation
   * (validateOnChainParticipantKeys); the builder passes them through
   * unasserted — approving devices may reject unsorted lists at load.
   */
  vaultKeeperBtcPubkeys: readonly string[];
  /**
   * x-only hex, sorted ascending upstream independently of vaultKeeperBtcPubkeys (same
   * pass-through contract). Universal challengers only — the full graph
   * challenger set is vaultKeeperBtcPubkeys ∪ universalChallengerBtcPubkeys (vault keepers are the local
   * challengers).
   */
  universalChallengerBtcPubkeys: readonly string[];
  /** Per-vault groups, ordered by ascending htlcVout. */
  vaults: readonly DepositTermsVaultGroup[];
}

/**
 * Implemented only by depositor-approval wallets (e.g. a Ledger vault provider).
 * Either a class field or a prototype method works — the deposit flow spreads
 * the wallet object but forwards this method explicitly at every wrapper site.
 *
 * PROVIDER OBLIGATION — device envelope: implementations MUST validate the
 * terms against their own device's accepted envelope (caps, ranges, value
 * floors) BEFORE starting the approval ceremony, and reject with an error of
 * the shape `{ name: "DepositTermsRejectedError", reason: "device-envelope",
 * message: <human-readable detail> }` rather than letting the device fail
 * opaquely mid-ceremony. The shape (not a class) is the cross-package
 * contract: providers throw a structurally-conforming error from their own
 * code; the SDK will normalize it by `name` at its approval call sites when
 * the first provider lands, #2109 (see `depositTermsErrors.ts`). Each
 * vendor owns its own envelope — device limits are never SDK concerns.
 *
 * PROVIDER OBLIGATION — idempotence: `approveDepositTerms` MUST be a no-op for a
 * byte-equal terms object on a live connection. The SDK approves once in
 * `PeginManager.preparePegin` and again in `runDepositorPresignFlow`, and those
 * may land on the same connection — a device that only admits one approval
 * ceremony per session must not be driven through a second one.
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
  return (
    typeof (wallet as Partial<DepositTermsApprover>).approveDepositTerms ===
    "function"
  );
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
  /** btc-vault tx-graph version the graph is built under. */
  vaultCoreVersion: number;
  protocolFeeRate: bigint;
  timelockPegin: number;
  /** btc-vault `timelock_assert` (t2) — its own param; NOT derived from timelockPegin here. */
  timelockAssert: number;
  timelockRefund: number;
  prepeginTxid: string;
  prepeginMaxFee: bigint;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: readonly string[];
  universalChallengerBtcPubkeys: readonly string[];
  /** Ceiling bps, not the quote — see {@link DepositTermsVaultGroup.commissionFee}. */
  maxAcceptableCommissionBps: number;
  peginAmounts: readonly bigint[];
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
}
