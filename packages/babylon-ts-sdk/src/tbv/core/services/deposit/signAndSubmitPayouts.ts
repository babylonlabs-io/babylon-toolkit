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
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import { DaemonStatus } from "../../clients/vault-provider/types";
import type {
  ClaimerSignatures,
  ClaimerTransactions,
} from "../../clients/vault-provider/types";
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
  /** BTC network (Mainnet, Testnet, etc.) */
  network: Network;
  /** On-chain registered depositor payout scriptPubKey (hex) */
  registeredPayoutScriptPubKey: string;
}

export interface PollAndSignPayoutsParams {
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
 * Derive BIP-86 P2TR scriptPubKey hex from an x-only public key.
 * Requires bitcoinjs-lib ECC to be initialized by the caller.
 */
function deriveBip86ScriptPubKey(xOnlyPubkeyHex: string): string {
  const { output } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(xOnlyPubkeyHex, "hex"),
  });
  if (!output) {
    throw new Error("Failed to derive BIP-86 P2TR scriptPubKey");
  }
  return output.toString("hex");
}

/**
 * Resolve the expected payout scriptPubKey for a given claimer.
 *
 * - VP/Depositor claimer: payout goes to the depositor's registered payout address
 * - VK claimer: payout goes to a BIP-86 P2TR address derived from the VK's pubkey
 *
 * Note: BIP-86 derivation for VK claimers requires bitcoinjs-lib's ECC to be initialized.
 */
function resolvePayoutScriptPubKey(
  claimerPubkeyXOnly: string,
  context: PayoutSigningContext,
): string {
  const claimer = stripHexPrefix(claimerPubkeyXOnly).toLowerCase();
  const vpPubkey = stripHexPrefix(
    context.vaultProviderBtcPubkey,
  ).toLowerCase();
  const depositorPubkey = stripHexPrefix(
    context.depositorBtcPubkey,
  ).toLowerCase();

  if (claimer === vpPubkey || claimer === depositorPubkey) {
    return context.registeredPayoutScriptPubKey;
  }

  // Verify claimer is a known vault keeper
  const isVaultKeeper = context.vaultKeeperBtcPubkeys.some(
    (vk) => stripHexPrefix(vk).toLowerCase() === claimer,
  );
  if (!isVaultKeeper) {
    throw new Error(
      `Unknown claimer pubkey ${claimer}: not VP, depositor, or a registered vault keeper`,
    );
  }

  // VK claimer: derive BIP-86 P2TR scriptPubKey from the VK's x-only pubkey
  const scriptPubKey = deriveBip86ScriptPubKey(claimer);
  return `0x${scriptPubKey}`;
}

function buildPayoutSigningInput(
  tx: PreparedTransaction,
  context: PayoutSigningContext,
) {
  return {
    payoutTxHex: tx.payoutTxHex,
    peginTxHex: context.peginTxHex,
    assertTxHex: tx.assertTxHex,
    vaultProviderBtcPubkey: context.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: context.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: context.universalChallengerBtcPubkeys,
    depositorBtcPubkey: context.depositorBtcPubkey,
    timelockPegin: context.timelockPegin,
    registeredPayoutScriptPubKey: resolvePayoutScriptPubKey(
      tx.claimerPubkeyXOnly,
      context,
    ),
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
export async function pollAndSignPayouts(
  params: PollAndSignPayoutsParams,
): Promise<void> {
  const {
    statusReader,
    presignClient,
    btcWallet,
    peginTxid,
    depositorPk,
    signingContext,
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
  // Filter out the depositor's own claimer entry — its payout is signed
  // separately via signDepositorGraph (Phase 4) using VP-provided PSBTs.
  // Including it here would cause a redundant wallet signing prompt whose
  // result is discarded when the depositor graph signature overwrites it.
  const depositorPkNormalized = processPublicKeyToXOnly(depositorPk);
  const nonDepositorTxs = response.txs.filter(
    (tx) => processPublicKeyToXOnly(tx.claimer_pubkey) !== depositorPkNormalized,
  );
  const preparedTransactions = prepareTransactionsForSigning(nonDepositorTxs);
  const claimerSignatures = await signPayoutTransactions(
    btcWallet,
    signingContext,
    preparedTransactions,
    onProgress,
  );

  signal?.throwIfAborted();

  // Phase 4: Sign depositor-as-claimer graph
  // Pass the authoritative pegin tx hex (from on-chain context) so signing can
  // verify Payout input 0's outpoint and prevout against the real peg-in UTXO.
  const depositorClaimerPresignatures = await signDepositorGraph({
    depositorGraph: response.depositor_graph,
    peginTxHex: signingContext.peginTxHex,
    depositorBtcPubkey: depositorPk,
    btcWallet,
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
