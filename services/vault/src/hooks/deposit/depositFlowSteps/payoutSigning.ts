/**
 * Step 3: Payout signing - poll for transactions and submit signatures
 */

import type { Address } from "viem";

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import { getBTCNetworkForWASM } from "@/config/pegin";
import { LocalStorageStatus } from "@/models/peginStateMachine";
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
import { isTransientPollingError } from "@/utils/peginPolling";

import type { PayoutSigningContext, PayoutSigningParams } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Timeout for RPC requests (60 seconds) */
const RPC_TIMEOUT_MS = 60 * 1000;

/** Polling interval (10 seconds) */
const POLLING_INTERVAL_MS = 10 * 1000;

/** Maximum polling timeout (20 minutes) - vault provider may take 15-20 minutes to prepare */
const MAX_POLLING_TIMEOUT_MS = 20 * 60 * 1000;

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
    signal,
  } = params;

  const buildContext = (
    payoutTransactions: import("@/clients/vault-provider-rpc/types").ClaimerTransactions[],
  ): PayoutSigningContext => {
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

    return {
      context,
      vaultProviderUrl: providerUrl,
      preparedTransactions: prepareTransactionsForSigning(payoutTransactions),
    };
  };

  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  return pollUntil<PayoutSigningContext>(
    async () => {
      const response = await rpcClient.requestDepositorPresignTransactions({
        pegin_txid: stripHexPrefix(btcTxid),
        depositor_pk: depositorBtcPubkey,
      });

      if (!response.txs || response.txs.length === 0) {
        return null;
      }

      return buildContext(response.txs);
    },
    {
      intervalMs: POLLING_INTERVAL_MS,
      timeoutMs: MAX_POLLING_TIMEOUT_MS,
      isTransient: isTransientPollingError,
      signal,
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
