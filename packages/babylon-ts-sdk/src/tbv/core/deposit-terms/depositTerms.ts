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
   * an approving wallet must expect: v1 = 2 outputs, no anchor; v2/v3 = TRUC
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
 * Implemented only by depositor-approval wallets (e.g. a Ledger vault
 * provider). Provider obligations:
 *
 * - Envelope: validate terms against the device's envelope BEFORE the
 *   ceremony, rejecting with the shape `{ name: "DepositTermsRejectedError",
 *   reason: "device-envelope", message }` (matched structurally, not by class).
 * - Idempotence: a byte-equal re-approval MUST be a no-op while the
 *   device-side approval is live; anything that invalidates it (a later
 *   `deriveContextHash`, a signing failure) MUST clear the memo.
 *
 * Seam invariant: any derive invalidates a prior approval, so the SDK
 * re-approves after every derive and before the next terms-bound signature.
 * The re-approval sites are `PeginManager.preparePegin`,
 * `runDepositorPresignFlow`, and `signAndBroadcast` (the Pre-PegIn broadcast,
 * which re-derives before approving unless `holdsApprovedDepositTerms`
 * reports the byte-equal intent still live — see `ensurePrePeginTermsApproval`).
 */
export interface DepositTermsApprover {
  approveDepositTerms(terms: DepositTerms): Promise<void>;
  /**
   * OPTIONAL fast-path probe: can the Pre-PegIn signature for exactly these
   * terms proceed under the connection's held approval without a new
   * ceremony? MUST report false once that Pre-PegIn was signed (one-shot),
   * MUST answer from host state without device I/O, MUST return false on any
   * doubt, and MUST never throw. A stale true fails closed at the next
   * signature — this is a UX optimization, never an authorization.
   */
  holdsApprovedDepositTerms?(terms: DepositTerms): Promise<boolean>;
  /**
   * OPTIONAL validate-only pre-check (#2110): reject terms the device
   * envelope would refuse, with the same `{ name:
   * "DepositTermsRejectedError", reason: "device-envelope", message }` shape
   * as `approveDepositTerms`, WITHOUT any device I/O and WITHOUT touching a
   * held approval — the SDK calls it before the first derive screen, so a
   * side effect here would cost or invalidate a physical ceremony. Success
   * is NOT an approval: `approveDepositTerms` still runs its own envelope
   * gate before the ceremony. Callers may pass provisional terms whose
   * `prepeginTxid` is a placeholder (the real txid exists only post-derive),
   * so implementations MUST NOT validate or bind `prepeginTxid` here.
   */
  validateDepositTerms?(terms: DepositTerms): Promise<void>;
}

/**
 * Where Pre-PegIn change must pay. Approval (policy) wallets sign key-path
 * under a wallet policy whose change branch the device alone can derive and
 * mark internal — the receive address is NOT acceptable change
 * (`process_in_outs.c:114-117` @ e400d8d8).
 *
 * Separate from {@link DepositTermsApprover} because only the Pre-PegIn build
 * needs it: the presign/payout ceremonies approve terms without ever creating
 * change, so they must not require a wallet to implement this.
 *
 * MUST be stable across a deposit flow: the app reads it to build the tx and
 * `preparePegin` re-reads it to verify, so mid-flow rotation fails that gate.
 */
export interface PrePeginChangeSource {
  getChangeAddress(): Promise<string>;
}

/** Probes {@link DepositTermsApprover.approveDepositTerms}. */
export function supportsDepositApproval(
  wallet: BitcoinWallet,
): wallet is BitcoinWallet & DepositTermsApprover {
  return (
    typeof (wallet as Partial<DepositTermsApprover>).approveDepositTerms ===
    "function"
  );
}

/**
 * The wallet's change address, for the one caller that needs it.
 *
 * Narrowing on `approveDepositTerms` alone cannot promise this method, so
 * calling it off the narrowed value would die on `is not a function` in the
 * middle of `preparePegin`, after the pubkey read. Ask here instead and fail
 * with something a provider author can act on.
 *
 * @throws If the wallet cannot report a change address.
 */
export async function requireChangeAddress(
  wallet: BitcoinWallet,
): Promise<string> {
  const changeSource = wallet as Partial<PrePeginChangeSource>;
  if (typeof changeSource.getChangeAddress !== "function") {
    throw new Error(
      "Approval wallet does not implement getChangeAddress; it must expose its change branch, " +
        "because the signing device accepts Pre-PegIn change only there.",
    );
  }
  return changeSource.getChangeAddress();
}

/**
 * Spreadable forward of the approval capability for wallet-wrapper objects.
 * Object spread drops prototype methods, so every `{...wallet}` wrapper site
 * must re-attach the capability explicitly: `...forwardDepositApproval(wallet)`.
 */
export function forwardDepositApproval(
  wallet: BitcoinWallet,
): Partial<DepositTermsApprover & PrePeginChangeSource> {
  if (!supportsDepositApproval(wallet)) {
    return {};
  }
  const holdsApprovedDepositTerms = wallet.holdsApprovedDepositTerms;
  const validateDepositTerms = wallet.validateDepositTerms;
  const getChangeAddress = (wallet as Partial<PrePeginChangeSource>)
    .getChangeAddress;
  return {
    approveDepositTerms: (terms) => wallet.approveDepositTerms(terms),
    // All optional in the seam: forward only what the provider implements, so
    // wrapper consumers can keep probing by typeof.
    ...(typeof getChangeAddress === "function"
      ? { getChangeAddress: () => getChangeAddress.call(wallet) }
      : {}),
    ...(typeof holdsApprovedDepositTerms === "function"
      ? {
          holdsApprovedDepositTerms: (terms: DepositTerms) =>
            holdsApprovedDepositTerms.call(wallet, terms),
        }
      : {}),
    ...(typeof validateDepositTerms === "function"
      ? {
          validateDepositTerms: (terms: DepositTerms) =>
            validateDepositTerms.call(wallet, terms),
        }
      : {}),
  };
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
