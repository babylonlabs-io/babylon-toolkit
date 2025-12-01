/**
 * Hook to poll vault provider RPC for pending peg-in transactions
 *
 * When a peg-in request has status 0 (Pending), this hook polls the vault provider
 * to get claim and payout transactions that need to be signed by the depositor.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../services/vault";
import type {
  ClaimerTransactions,
  RequestClaimAndPayoutTransactionsResponse,
} from "../../types";
import { stripHexPrefix } from "../../utils/btc";

import { useVaultProviders } from "./useVaultProviders";

export interface PendingPeginTx {
  /** Peg-in transaction ID */
  peginTxId: string;
  /** Vault provider Ethereum address */
  vaultProviderAddress: Hex;
  /** Depositor's BTC public key (32-byte x-only, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Application controller address for fetching providers */
  applicationController: string;
}

export interface UsePendingPeginTxPollingResult {
  /** Transactions ready for signing (null if still pending or error) */
  transactions: ClaimerTransactions[] | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether transactions are ready to be signed */
  isReady: boolean;
}

/**
 * Poll vault provider RPC for peg-in transactions
 *
 * This hook polls the vault provider RPC to fetch claim and payout transactions
 * that need to be signed by the depositor during the peg-in flow.
 *
 * **Polling Behavior:**
 * - Polls every 30 seconds when params are provided
 * - **Stops polling when:**
 *   1. Transactions are ready (both claim_tx and payout_tx exist)
 *   2. params is set to null (e.g., when status changes from 0 to something else)
 *
 * **Flow:**
 * 1. Gets vault provider URL from globally cached providers (via useVaultProviders)
 * 2. Polls vault provider RPC for claim/payout transactions every 30 seconds
 * 3. Returns transactions when both claim_tx and payout_tx are available
 *
 * @param params - Peg-in transaction details. Pass null to disable polling (e.g., when status is not 0)
 * @returns Polling result with transactions, loading, error states
 */
export function usePendingPeginTxPolling(
  params: PendingPeginTx | null,
): UsePendingPeginTxPollingResult {
  // Step 1: Get cached vault providers for the specific application
  const {
    findProvider,
    loading: providersLoading,
    error: providersError,
  } = useVaultProviders(params?.applicationController);

  // Step 2: Find the specific provider URL from cached data
  const providerUrl = useMemo(() => {
    if (!params) return null;
    const provider = findProvider(params.vaultProviderAddress);
    return provider?.url || null;
  }, [params, findProvider]);

  // Step 3: Validate provider exists and has URL
  const providerError = useMemo(() => {
    if (!params || providersLoading) return null;
    if (providersError) return providersError;

    const provider = findProvider(params.vaultProviderAddress);
    if (!provider) {
      return new Error(
        `Vault provider ${params.vaultProviderAddress} not found in indexer`,
      );
    }
    if (!provider.url) {
      return new Error(
        `Vault provider ${params.vaultProviderAddress} has no RPC URL`,
      );
    }
    return null;
  }, [params, findProvider, providersLoading, providersError]);

  // Step 4: Poll vault provider RPC for transactions
  // Only poll if params exist, provider is found, and no provider errors
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "pendingPeginTx",
      params?.peginTxId,
      params?.vaultProviderAddress,
      providerUrl,
    ],
    queryFn: async () => {
      if (!params || !providerUrl) {
        throw new Error("Missing parameters or provider URL");
      }

      // Create RPC client with provider URL
      const rpcClient = new VaultProviderRpcApi(providerUrl, 30000);

      try {
        // Request claim and payout transactions
        // Note: Bitcoin Txid expects hex without "0x" prefix (64 chars)
        // Frontend uses Ethereum-style "0x"-prefixed hex, so we strip it
        const response = await rpcClient.requestClaimAndPayoutTransactions({
          pegin_tx_id: stripHexPrefix(params.peginTxId),
          depositor_pk: params.depositorBtcPubkey,
        });

        return response;
      } catch (error) {
        // Expected error: Daemon is still processing (e.g., in "Acknowledged" state)
        // Transactions are not ready yet - keep polling
        if (
          error instanceof Error &&
          error.message.includes("Invalid state") &&
          (error.message.includes("Acknowledged") ||
            error.message.includes("PendingChallengerSignatures"))
        ) {
          // Return empty response to indicate transactions not ready yet
          // This will continue polling without throwing error to console
          return { txs: [] };
        }

        // Unexpected error - rethrow to be handled by React Query
        throw error;
      }
    },
    // Only enable polling when:
    // 1. params exist (pegin is in pending status)
    // 2. providerUrl is found
    // 3. no provider errors
    enabled: !!params && !!providerUrl && !providerError,
    // Poll every 30 seconds until transactions are ready
    refetchInterval: (query) => {
      // Stop polling if we have valid transactions (both claim_tx and payout_tx exist)
      if (query.state.data && areTransactionsReady(query.state.data)) {
        return false;
      }
      // Continue polling every 30 seconds
      return 30000;
    },
    // Retry on failure (transient network errors)
    retry: 3,
    retryDelay: 5000,
  });

  // Check if transactions are ready (both claim_tx and payout_tx available)
  const isReady = data ? areTransactionsReady(data) : false;

  return {
    transactions: isReady && data ? data.txs : null,
    loading: isLoading || (!providerUrl && !providerError && !!params),
    error: (error as Error | null) || providerError,
    isReady,
  };
}

/**
 * Check if all transactions are ready for signing
 * @param response - Response from vault provider RPC
 * @returns true if all transactions have both claim_tx and payout_tx
 */
function areTransactionsReady(
  response: RequestClaimAndPayoutTransactionsResponse,
): boolean {
  if (!response.txs || response.txs.length === 0) {
    return false;
  }

  // Check that all claimer transactions have both claim_tx and payout_tx
  return response.txs.every(
    (tx) =>
      tx.claim_tx?.tx_hex &&
      tx.payout_tx?.tx_hex &&
      tx.claim_tx.tx_hex.length > 0 &&
      tx.payout_tx.tx_hex.length > 0,
  );
}
