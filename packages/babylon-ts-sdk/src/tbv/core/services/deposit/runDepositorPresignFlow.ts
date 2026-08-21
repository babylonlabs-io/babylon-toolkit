/**
 * Payout Signing Orchestration
 *
 * Polls VP for `PendingDepositorSignatures`, fetches presign transactions,
 * signs payouts via PayoutManager, signs the depositor graph, and submits
 * all signatures back to the VP.
 *
 * This is the main deposit protocol step between registration and activation.
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import type {
  ClaimerSignatures,
  ClaimerTransactions,
} from "../../clients/vault-provider/types";
import { DaemonStatus } from "../../clients/vault-provider/types";
import {
  supportsDepositApproval,
  type DepositTerms,
} from "../../deposit-terms";
import { PayoutManager } from "../../managers/PayoutManager";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
} from "../../primitives/utils/bitcoin";
import type { PeginStatusReader, PresignClient } from "./interfaces";
import { signDepositorGraph } from "./signDepositorGraph";
import { waitForPeginStatus } from "./waitForPeginStatus";

// ============================================================================
// Types
// ============================================================================

/**
 * Context required for signing payout transactions.
 * Caller builds this from on-chain data (contract queries, GraphQL, config).
 */
export interface PayoutSigningContext {
  /**
   * Vault core (tx-graph) version the vault was registered under — the
   * vault's stamped on-chain `vaultCoreVersion` from `BTCVaultRegistry`.
   * Selects which graph's connector scripts every payout/nopayout PSBT is
   * rebuilt with.
   */
  vaultCoreVersion: number;
  /** Raw pegin BTC transaction hex (for PSBT construction) */
  peginTxHex: string;
  /** Vault provider's BTC public key (x-only hex, no prefix) */
  vaultProviderBtcPubkey: string;
  /** Sorted vault keeper BTC public keys (x-only hex, no prefix) */
  vaultKeeperBtcPubkeys: string[];
  /** Sorted universal challenger BTC public keys (x-only hex, no prefix) */
  universalChallengerBtcPubkeys: string[];
  /** Depositor's BTC public key (x-only hex, no prefix) */
  depositorBtcPubkey: string;
  /** Pegin timelock from the locked offchain params version */
  timelockPegin: number;
  /**
   * Assert CSV timelock from the locked offchain params version (blocks).
   * Source: ProtocolParams contract via
   * `ViemProtocolParamsReader.getOffchainParamsByVersion(...).timelockAssert`.
   * Required for the depositor-graph NoPayout local rebuild.
   */
  timelockAssert: number;
  /**
   * Security council member x-only public keys (hex, no prefix).
   * Source: ProtocolParams contract via
   * `getOffchainParamsByVersion(...).securityCouncilKeys`.
   * Required to rebuild every Assert:0 leaf (payout and NoPayout) locally.
   */
  councilMembers: string[];
  /**
   * M-of-N council quorum threshold.
   * Source: ProtocolParams contract via
   * `getOffchainParamsByVersion(...).councilQuorum`.
   * Required to rebuild every Assert:0 leaf (payout and NoPayout) locally.
   */
  councilQuorum: number;
  /** BTC network (Mainnet, Testnet, etc.) */
  network: Network;
  /** On-chain registered depositor payout scriptPubKey (hex) */
  registeredPayoutScriptPubKey: string;
  /** VP commission (bps) from `BTCVaultRegistry`; caps the VP-claimer payout commission output. */
  commissionBps: number;
  /**
   * Tx-graph fee rate (sat/vB) from the locked offchain params version —
   * `getOffchainParamsByVersion(...).feeRate`, the rate the VP built the
   * graph with. Bounds every payout's implicit fee (payout fee band).
   */
  protocolFeeRate: bigint;

  /**
   * RFC-006 resolved keeper payout destinations at the vault's frozen
   * `appKeeperKeyEpoch`, keyed by lowercased x-only operation pubkey.
   */
  vkClaimerPayoutScriptPubKeys: Readonly<Record<string, string>>;
  /**
   * RFC-006 resolved VP commission destination at the vault's frozen
   * `vpKeyEpoch`.
   */
  vpCommissionScriptPubKey: string;
}

export interface RunDepositorPresignFlowParams {
  /** VP client implementing the status reader interface */
  statusReader: PeginStatusReader;
  /** VP client implementing the presign transaction flow interface */
  presignClient: PresignClient;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
  /** BTC pegin transaction ID (unprefixed hex, 64 chars) */
  peginTxid: string;
  /** Depositor's x-only BTC public key (unprefixed hex, 64 chars) */
  depositorPk: string;
  /** Signing context built from on-chain data */
  signingContext: PayoutSigningContext;
  /**
   * Required for approval-capable wallets. Fresh flows pass
   * PreparePeginResult.depositTerms; resume flows rebuild them from
   * on-chain state (the vault app's rebuildDepositTerms).
   */
  depositTerms?: DepositTerms;
  /** Maximum polling timeout in milliseconds (default: 20 min) */
  timeoutMs?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Optional progress callback (completed claimers, total claimers) */
  onProgress?: (completed: number, total: number) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum polling timeout (20 minutes) — VP may take 15-20 min to prepare. */
const MAX_POLLING_TIMEOUT_MS = 20 * 60 * 1000;

/** Statuses after payout signatures are submitted — if VP is already here, skip. */
const POST_PAYOUT_STATUSES: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_ACKS,
  DaemonStatus.PENDING_ACTIVATION,
  DaemonStatus.ACTIVATED_PENDING_BROADCAST,
  DaemonStatus.ACTIVATED,
]);

const TARGET_STATUS: ReadonlySet<DaemonStatus> = new Set([
  DaemonStatus.PENDING_DEPOSITOR_SIGNATURES,
  ...POST_PAYOUT_STATUSES,
]);

// ============================================================================
// Internal helpers
// ============================================================================

interface PreparedTransaction {
  claimerPubkeyXOnly: string;
  payoutTxHex: string;
  assertTxHex: string;
}

function prepareTransactionsForSigning(
  claimerTransactions: ClaimerTransactions[],
): PreparedTransaction[] {
  return claimerTransactions.map((tx) => ({
    claimerPubkeyXOnly: processPublicKeyToXOnly(tx.claimer_pubkey),
    payoutTxHex: tx.payout_tx.tx_hex,
    assertTxHex: tx.assert_tx.tx_hex,
  }));
}

/**
 * Canonical x-only lowercase form, used for all claimer pubkey set-equality
 * comparisons in this module. `processPublicKeyToXOnly` already strips any
 * `0x` prefix; the lowercase here removes case-sensitivity (the VP-response
 * schema validator accepts uppercase hex, and `processPublicKeyToXOnly`
 * preserves the case of already-x-only 64-char input).
 */
function normalizeClaimerPubkey(pubkey: string): string {
  return processPublicKeyToXOnly(pubkey).toLowerCase();
}

/**
 * Assert the approved terms describe the graph we will actually sign. An
 * RFC-006 key rotation bumps only a key epoch, so no version comparison can
 * catch it; `verifyRegisteredParticipantKeys` is the app-side pin, and this
 * keeps the seam self-contained for external providers (#2109).
 *
 * @throws If the terms and the signing context disagree
 */
function assertDepositTermsMatchSigningContext(
  terms: DepositTerms,
  context: PayoutSigningContext,
): void {
  const refuse = (field: string, a: unknown, b: unknown): never => {
    throw new Error(
      `Deposit terms ${field} (${String(a)}) does not match the vault's ` +
        `version-locked signing context (${String(b)}); refusing to sign ` +
        `payouts against terms that describe a different graph.`,
    );
  };

  // Every scalar the two types share: each one shapes the graph, and the
  // timelocks are what payout.ts pins the input sequences to.
  const scalars = [
    ["protocolFeeRate", terms.protocolFeeRate, context.protocolFeeRate],
    ["vaultCoreVersion", terms.vaultCoreVersion, context.vaultCoreVersion],
    ["timelockPegin", terms.timelockPegin, context.timelockPegin],
    ["timelockAssert", terms.timelockAssert, context.timelockAssert],
  ] as const;
  for (const [field, fromTerms, fromContext] of scalars) {
    if (fromTerms !== fromContext) {
      refuse(field, fromTerms, fromContext);
    }
  }

  // Set, not sequence: btc-vault sorts every roster and rejects duplicates
  // (crates/vault/src/lib.rs:249, :339), so a permutation is not drift.
  const canonical = (keys: readonly string[]) =>
    keys.map(normalizeClaimerPubkey).sort();
  const sameSet = (a: readonly string[], b: readonly string[]) => {
    const x = canonical(a);
    const y = canonical(b);
    return x.length === y.length && x.every((k, i) => k === y[i]);
  };

  if (!sameSet(terms.vaultKeeperBtcPubkeys, context.vaultKeeperBtcPubkeys)) {
    refuse(
      "vaultKeeperBtcPubkeys",
      terms.vaultKeeperBtcPubkeys.join(","),
      context.vaultKeeperBtcPubkeys.join(","),
    );
  }
  if (
    !sameSet(
      terms.universalChallengerBtcPubkeys,
      context.universalChallengerBtcPubkeys,
    )
  ) {
    refuse(
      "universalChallengerBtcPubkeys",
      terms.universalChallengerBtcPubkeys.join(","),
      context.universalChallengerBtcPubkeys.join(","),
    );
  }

  // Membership, not equality: `DepositTermsVaultGroup` carries a per-vault VP
  // key, so a batch may legitimately span providers. What matters is that the
  // vault this flow signs for was covered by what the depositor approved.
  const contextVp = normalizeClaimerPubkey(context.vaultProviderBtcPubkey);
  const approvedVps = terms.vaults.map((v) =>
    normalizeClaimerPubkey(v.vaultProviderBtcPubkey),
  );
  if (!approvedVps.includes(contextVp)) {
    refuse(
      "vaults[].vaultProviderBtcPubkey",
      approvedVps.join(",") || "<no vaults>",
      context.vaultProviderBtcPubkey,
    );
  }
}

/**
 * Reject VP-supplied `response.txs` whose non-depositor claimer set does not
 * exactly equal `{vaultProviderBtcPubkey} ∪ vaultKeeperBtcPubkeys`.
 *
 * The expected set is derived from on-chain context (sourced by the caller
 * from the registry/contract reads that populate PayoutSigningContext). A
 * malicious or buggy VP could otherwise omit registered vault keepers from
 * the response; the depositor would sign only the supplied subset and submit
 * a partial presignature map. If the VP later disappears, the omitted
 * keepers cannot exercise their payout recovery branch and BTC can lock.
 *
 * The depositor's own claimer entry (if present in `response.txs`) is
 * filtered out before diffing — its Payout PSBT is built locally and signed
 * separately via signDepositorGraph, so its presence in `response.txs` is
 * permitted but not required. Duplicate detection runs on the full supplied
 * list *before* the depositor filter, so a response containing
 * `[VP, VK, depositor, depositor]` is rejected as malformed.
 */
function assertNonDepositorClaimerSetMatches(
  suppliedTxs: ClaimerTransactions[],
  expectedVpPubkey: string,
  expectedVkPubkeys: string[],
  depositorPubkeyXOnly: string,
): void {
  const depositor = normalizeClaimerPubkey(depositorPubkeyXOnly);
  const expectedList = [
    normalizeClaimerPubkey(expectedVpPubkey),
    ...expectedVkPubkeys.map(normalizeClaimerPubkey),
  ];
  const expected = new Set(expectedList);
  if (expected.size !== expectedList.length) {
    throw new Error(
      "Cannot validate claimer set: signing context contains duplicate vault provider or vault keeper key",
    );
  }
  if (expected.has(depositor)) {
    throw new Error(
      "Cannot validate claimer set: depositor key overlaps with vault provider or vault keeper set",
    );
  }

  const suppliedAll = suppliedTxs.map((tx) =>
    normalizeClaimerPubkey(tx.claimer_pubkey),
  );
  if (new Set(suppliedAll).size !== suppliedAll.length) {
    throw new Error("Presign response contains duplicate claimer entries");
  }

  const suppliedNonDepositor = suppliedAll.filter((k) => k !== depositor);
  const suppliedSet = new Set(suppliedNonDepositor);
  const missing = expectedList.filter((c) => !suppliedSet.has(c));
  const extra = suppliedNonDepositor.filter((c) => !expected.has(c));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Presign response claimer set does not match expected (vault provider ∪ vault keepers)` +
        (missing.length > 0 ? ` (missing: ${missing.join(", ")})` : "") +
        (extra.length > 0 ? ` (unexpected: ${extra.join(", ")})` : ""),
    );
  }
}

/**
 * Build the `SignPayoutParams` for a single claimer. Role/script resolution
 * happens inside `buildPayoutPsbt`; here we only forward the claimer pubkey
 * and the per-vault context fields.
 */
function buildPayoutSigningInput(
  tx: PreparedTransaction,
  context: PayoutSigningContext,
) {
  return {
    vaultCoreVersion: context.vaultCoreVersion,
    payoutTxHex: tx.payoutTxHex,
    peginTxHex: context.peginTxHex,
    assertTxHex: tx.assertTxHex,
    vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
    depositorBtcPubkey: context.depositorBtcPubkey,
    timelockPegin: context.timelockPegin,
    timelockAssert: context.timelockAssert,
    registeredPayoutScriptPubKey: context.registeredPayoutScriptPubKey,
    claimerBtcPubkey: tx.claimerPubkeyXOnly,
    commissionBps: context.commissionBps,
    protocolFeeRate: context.protocolFeeRate,
    councilMembers: context.councilMembers,
    councilQuorum: context.councilQuorum,
    vkClaimerPayoutScriptPubKeys: context.vkClaimerPayoutScriptPubKeys,
    vpCommissionScriptPubKey: context.vpCommissionScriptPubKey,
  };
}

/**
 * Sign all payout transactions using PayoutManager.
 * Uses batch signing when wallet supports it, sequential otherwise.
 */
async function signPayoutTransactions(
  btcWallet: BitcoinWallet,
  context: PayoutSigningContext,
  transactions: PreparedTransaction[],
  onProgress?: (completed: number, total: number) => void,
): Promise<Record<string, ClaimerSignatures>> {
  const payoutManager = new PayoutManager({
    network: context.network,
    btcWallet,
  });

  const totalClaimers = transactions.length;
  onProgress?.(0, totalClaimers);

  let payoutSignatures: string[];

  if (payoutManager.supportsBatchSigning()) {
    const results = await payoutManager.signPayoutTransactionsBatch(
      transactions.map((tx) => buildPayoutSigningInput(tx, context)),
    );
    payoutSignatures = results.map((r) => r.payoutSignature);
  } else {
    payoutSignatures = [];
    for (let i = 0; i < transactions.length; i++) {
      onProgress?.(i, totalClaimers);
      const result = await payoutManager.signPayoutTransaction(
        buildPayoutSigningInput(transactions[i], context),
      );
      payoutSignatures.push(result.signature);
    }
  }

  const signatures: Record<string, ClaimerSignatures> = {};
  for (let i = 0; i < transactions.length; i++) {
    signatures[transactions[i].claimerPubkeyXOnly] = {
      payout_signature: payoutSignatures[i],
    };
  }

  onProgress?.(totalClaimers, totalClaimers);
  return signatures;
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Poll for payout transactions, sign them, sign the depositor graph,
 * and submit all signatures to the vault provider.
 *
 * This is the main deposit protocol step between registration and activation.
 *
 * @throws Error on timeout, abort, signing failure, or RPC error
 */
export async function runDepositorPresignFlow(
  params: RunDepositorPresignFlowParams,
): Promise<void> {
  const {
    statusReader,
    presignClient,
    btcWallet,
    peginTxid,
    depositorPk,
    signingContext,
    depositTerms,
    timeoutMs = MAX_POLLING_TIMEOUT_MS,
    signal,
    onProgress,
  } = params;

  // Phase 1: Poll until VP is ready for depositor signatures (or already past)
  const status = await waitForPeginStatus({
    statusReader,
    peginTxid,
    targetStatuses: TARGET_STATUS,
    timeoutMs,
    signal,
  });

  // Resume-safe: if VP already moved past payout signing, nothing to do
  if (POST_PAYOUT_STATUSES.has(status)) {
    return;
  }

  signal?.throwIfAborted();

  // Approval-capable wallets must approve before any signing call they
  // authorize, and the terms must match what we sign. Conditional because
  // non-approval wallets pass no terms.
  if (depositTerms !== undefined) {
    assertDepositTermsMatchSigningContext(depositTerms, signingContext);
  }

  if (supportsDepositApproval(btcWallet)) {
    if (!depositTerms) {
      throw new Error(
        "runDepositorPresignFlow: this wallet requires approved deposit terms but none were " +
          "provided. Fresh deposits must pass PreparePeginResult.depositTerms; resume flows " +
          "must rebuild them from on-chain state (the vault app's rebuildDepositTerms).",
      );
    }
    // The provider validates its own device envelope inside
    // approveDepositTerms (DepositTermsApprover contract, #2109).
    await btcWallet.approveDepositTerms(depositTerms);
  }

  // Phase 2: Fetch presign transactions
  const response = await presignClient.requestDepositorPresignTransactions(
    {
      pegin_txid: peginTxid,
      depositor_pk: depositorPk,
    },
    signal,
  );

  signal?.throwIfAborted();

  // Phase 3: Sign VP/VK claimer payout transactions
  // Fail-fast: assert the supplied non-depositor claimer set exactly equals
  // the on-chain-derived {VP} ∪ {VKs} before any wallet prompts run. The
  // depositor's own entry is permitted but not required (its payout is
  // signed separately via signDepositorGraph in Phase 4).
  const depositorPkNormalized = normalizeClaimerPubkey(depositorPk);
  assertNonDepositorClaimerSetMatches(
    response.txs,
    signingContext.vaultProviderBtcPubkey,
    signingContext.vaultKeeperBtcPubkeys,
    depositorPk,
  );
  // Filter out the depositor's own claimer entry — its payout is signed
  // separately via signDepositorGraph (Phase 4) using VP-provided PSBTs.
  // Including it here would cause a redundant wallet signing prompt whose
  // result is discarded when the depositor graph signature overwrites it.
  // Compare on the normalized form so an uppercase-hex depositor entry in
  // the VP response is still filtered out consistently with the assertion.
  const nonDepositorTxs = response.txs.filter(
    (tx) => normalizeClaimerPubkey(tx.claimer_pubkey) !== depositorPkNormalized,
  );
  const preparedTransactions = prepareTransactionsForSigning(nonDepositorTxs);
  const claimerSignatures = await signPayoutTransactions(
    btcWallet,
    signingContext,
    preparedTransactions,
    onProgress,
  );

  signal?.throwIfAborted();

  // Phase 4: Sign depositor-as-claimer graph. Both Payout and per-challenger
  // NoPayout PSBTs are rebuilt locally inside signDepositorGraph from these
  // authoritative connector params and the on-chain protocol parameters.
  const depositorClaimerPresignatures = await signDepositorGraph({
    depositorGraph: response.depositor_graph,
    btcWallet,
    signingContext: {
      vaultCoreVersion: signingContext.vaultCoreVersion,
      peginTxHex: signingContext.peginTxHex,
      depositorBtcPubkey: depositorPk,
      vaultProviderBtcPubkey: signingContext.vaultProviderBtcPubkey,
      vaultKeeperBtcPubkeys: signingContext.vaultKeeperBtcPubkeys,
      universalChallengerBtcPubkeys:
        signingContext.universalChallengerBtcPubkeys,
      timelockPegin: signingContext.timelockPegin,
      timelockAssert: signingContext.timelockAssert,
      councilMembers: signingContext.councilMembers,
      councilQuorum: signingContext.councilQuorum,
      network: signingContext.network,
      registeredPayoutScriptPubKey: signingContext.registeredPayoutScriptPubKey,
      protocolFeeRate: signingContext.protocolFeeRate,
      vkClaimerPayoutScriptPubKeys: signingContext.vkClaimerPayoutScriptPubKeys,
      vpCommissionScriptPubKey: signingContext.vpCommissionScriptPubKey,
    },
  });

  signal?.throwIfAborted();

  // Phase 5: Submit all signatures to VP
  // Include depositor's own payout signature in the signatures map
  const allSignatures = { ...claimerSignatures };
  allSignatures[stripHexPrefix(depositorPk)] =
    depositorClaimerPresignatures.payout_signatures;

  await presignClient.submitDepositorPresignatures(
    {
      pegin_txid: peginTxid,
      depositor_pk: depositorPk,
      signatures: allSignatures,
      depositor_claimer_presignatures: depositorClaimerPresignatures,
    },
    signal,
  );
}
