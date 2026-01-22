/**
 * Step 3: Payout signing - poll for transactions and submit signatures
 */

import type { Address } from "viem";

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import { getBTCNetworkForWASM } from "@/config/pegin";
import {
  isPreDepositorSignaturesError,
  LocalStorageStatus,
} from "@/models/peginStateMachine";
import {
  getSortedUniversalChallengerPubkeys,
  getSortedVaultKeeperPubkeys,
  prepareTransactionsForSigning,
  submitSignaturesToVaultProvider,
  type SigningContext,
} from "@/services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "@/storage/peginStorage";
import { pollUntil } from "@/utils/async";
import { stripHexPrefix } from "@/utils/btc";

import type { PayoutSigningContext, PayoutSigningParams } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Timeout for RPC requests (30 seconds) */
const RPC_TIMEOUT_MS = 30 * 1000;

/** Polling interval (10 seconds) */
const POLLING_INTERVAL_MS = 10 * 1000;

/** Maximum polling timeout (2 minutes) */
const MAX_POLLING_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Transient error patterns that indicate polling should continue.
 * These errors occur when vault provider or indexer hasn't processed the pegin yet.
 */
const TRANSIENT_ERROR_PATTERNS = [
  "PegIn not found",
  "No transaction graphs found",
  "Vault or pegin transaction not found",
] as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is transient and polling should continue.
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // Check for pre-depositor-signatures states (vault provider still processing)
  if (isPreDepositorSignaturesError(error)) {
    return true;
  }

  // Check for other transient patterns
  return TRANSIENT_ERROR_PATTERNS.some((pattern) =>
    error.message.includes(pattern),
  );
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Poll for payout transactions and prepare signing context.
 *
 * This function polls the vault provider until payout transactions are ready.
 * The signing context is constructed from data passed in (from step 2),
 * avoiding any dependency on the GraphQL indexer for step 3.
 */
export async function pollAndPreparePayoutSigning(
  params: PayoutSigningParams,
): Promise<PayoutSigningContext> {
  const {
    btcTxid,
    btcTxHex,
    depositorBtcPubkey,
    providerUrl,
    providerBtcPubKey,
    vaultKeepers,
    universalChallengers,
  } = params;

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  // Poll vault provider until payout transactions are ready
  return pollUntil<PayoutSigningContext>(
    async () => {
      // Fetch payout transactions from vault provider
      const response = await rpcClient.requestDepositorPresignTransactions({
        pegin_txid: stripHexPrefix(btcTxid),
        depositor_pk: depositorBtcPubkey,
      });

      if (!response.txs || response.txs.length === 0) {
        return null; // Continue polling
      }

      const payoutTransactions = response.txs;

      // Construct signing context from passed-in data (no indexer dependency)
      const vaultKeeperBtcPubkeys = getSortedVaultKeeperPubkeys(vaultKeepers);
      const universalChallengerBtcPubkeys =
        getSortedUniversalChallengerPubkeys(universalChallengers);

      const context: SigningContext = {
        peginTxHex: btcTxHex,
        vaultProviderBtcPubkey: stripHexPrefix(providerBtcPubKey),
        vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys,
        depositorBtcPubkey,
        network: getBTCNetworkForWASM(),
      };

      // Prepare transactions for signing
      const preparedTransactions =
        prepareTransactionsForSigning(payoutTransactions);

      return {
        context,
        vaultProviderUrl: providerUrl,
        preparedTransactions,
      };
    },
    {
      intervalMs: POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      isTransient: isTransientError,
    },
  );
}

/**
 * Submit payout signatures to vault provider.
 */
export async function submitPayoutSignatures(
  vaultProviderUrl: string,
  btcTxid: string,
  depositorBtcPubkey: string,
  signatures: Record<
    string,
    { payout_optimistic_signature: string; payout_signature: string }
  >,
  depositorEthAddress: Address,
): Promise<void> {
  await submitSignaturesToVaultProvider(
    vaultProviderUrl,
    btcTxid,
    depositorBtcPubkey,
    signatures,
  );

  updatePendingPeginStatus(
    depositorEthAddress,
    btcTxid,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}
