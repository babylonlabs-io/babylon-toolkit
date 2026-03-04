/**
 * Hook to poll vault provider RPC for pending peg-in transactions
 *
 * When a peg-in request has status 0 (Pending), this hook polls the vault provider
 * to get claim, assert, and payout transactions that need to be signed by the depositor.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

import type { DepositorGraphTransactions } from "../../clients/vault-provider-rpc/types";
import { isPreDepositorSignaturesError } from "../../models/peginStateMachine";
import { VaultProviderRpcApi } from "../../services/vault";
import type { ClaimerTransactions } from "../../types";
import { stripHexPrefix } from "../../utils/btc";
import { areTransactionsReady } from "../../utils/peginPolling";

import { useVaultProviders } from "./useVaultProviders";

/** Timeout for RPC requests (30 seconds) */
const RPC_TIMEOUT_MS = 30_000;

/** Polling interval (30 seconds) */
const POLLING_INTERVAL_MS = 30_000;

/** Number of retries on transient failures */
const RETRY_COUNT = 3;

/** Delay between retries (5 seconds) */
const RETRY_DELAY_MS = 5_000;

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
  /** Depositor graph transactions (depositor-as-claimer, optional) */
  depositorGraph: DepositorGraphTransactions | null;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Whether transactions are ready to be signed */
  isReady: boolean;
}

/**
 * Resolve vault provider URL and validate it exists.
 * Returns { url, error } — exactly one will be non-null when params are provided.
 */
function useResolvedProvider(params: PendingPeginTx | null) {
  const {
    findProvider,
    loading: providersLoading,
    error: providersError,
  } = useVaultProviders(params?.applicationController);

  return useMemo(() => {
    if (!params || providersLoading) return { url: null, error: null };
    if (providersError) return { url: null, error: providersError };

    const provider = findProvider(params.vaultProviderAddress);
    if (!provider) {
      return {
        url: null,
        error: new Error(
          `Vault provider ${params.vaultProviderAddress} not found in indexer`,
        ),
      };
    }
    if (!provider.url) {
      return {
        url: null,
        error: new Error(
          `Vault provider ${params.vaultProviderAddress} has no RPC URL`,
        ),
      };
    }
    return { url: provider.url, error: null };
  }, [params, findProvider, providersLoading, providersError]);
}

/**
 * Poll vault provider RPC for peg-in transactions
 *
 * This hook polls the vault provider RPC to fetch claim, assert, and payout
 * transactions that need to be signed by the depositor during the peg-in flow.
 *
 * **Polling Behavior:**
 * - Polls every 30 seconds when params are provided
 * - **Stops polling when:**
 *   1. Transactions are ready (claim_tx, assert_tx, and payout_tx all exist)
 *   2. params is set to null (e.g., when status changes from 0 to something else)
 *
 * @param params - Peg-in transaction details. Pass null to disable polling.
 */
export function usePendingPeginTxPolling(
  params: PendingPeginTx | null,
): UsePendingPeginTxPollingResult {
  const { url: providerUrl, error: providerError } =
    useResolvedProvider(params);

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

      const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

      try {
        return await rpcClient.requestDepositorPresignTransactions({
          pegin_txid: stripHexPrefix(params.peginTxId),
          depositor_pk: params.depositorBtcPubkey,
        });
      } catch (err) {
        // Expected: daemon is still processing (before PendingDepositorSignatures).
        // Return null to keep polling without surfacing an error.
        if (isPreDepositorSignaturesError(err)) return null;
        throw err;
      }
    },
    enabled: !!params && !!providerUrl && !providerError,
    refetchInterval: (query) => {
      const txs = query.state.data?.txs;
      if (txs && areTransactionsReady(txs)) return false;
      return POLLING_INTERVAL_MS;
    },
    retry: RETRY_COUNT,
    retryDelay: RETRY_DELAY_MS,
  });

  const isReady = data?.txs ? areTransactionsReady(data.txs) : false;

  return {
    transactions: isReady && data ? data.txs : null,
    depositorGraph: isReady && data ? data.depositor_graph : null,
    loading: isLoading || (!providerUrl && !providerError && !!params),
    error: (error as Error | null) || providerError,
    isReady,
  };
}
