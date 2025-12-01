/**
 * Hook for polling peg-in transactions from vault providers
 *
 * Manages the React Query polling loop for fetching claim/payout
 * transactions from all vault providers in parallel.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { ClaimerTransactions, VaultProvider } from "../../types";
import type { VaultActivity } from "../../types/activity";
import type {
  DepositsByProvider,
  DepositToPoll,
} from "../../types/peginPolling";
import { stripHexPrefix } from "../../utils/btc";
import {
  areTransactionsReady,
  getDepositsNeedingPolling,
  groupDepositsByProvider,
} from "../../utils/peginPolling";

/** Timeout for RPC requests to vault provider (30 seconds) */
const RPC_TIMEOUT_MS = 30 * 1000;
/** Interval between polling attempts (30 seconds) */
const POLLING_INTERVAL_MS = 30 * 1000;
/** Number of retry attempts on failure */
const POLLING_RETRY_COUNT = 3;
/** Delay between retry attempts (5 seconds) */
const POLLING_RETRY_DELAY_MS = 5 * 1000;

interface UsePeginPollingQueryParams {
  activities: VaultActivity[];
  pendingPegins: PendingPeginRequest[];
  btcPublicKey?: string;
  vaultProviders: VaultProvider[];
}

interface UsePeginPollingQueryResult {
  /** Map of depositId -> transactions */
  data: Map<string, ClaimerTransactions[]> | undefined;
  /** Whether any polling is in progress */
  isLoading: boolean;
  /** Trigger manual refetch */
  refetch: () => void;
  /** Deposits that are being polled */
  depositsToPoll: DepositToPoll[];
}

/**
 * Fetch transactions from a single vault provider for multiple deposits
 */
async function fetchFromProvider(
  providerUrl: string,
  deposits: DepositToPoll[],
  btcPublicKey: string,
  results: Map<string, ClaimerTransactions[]>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  for (const deposit of deposits) {
    try {
      const response = await rpcClient.requestClaimAndPayoutTransactions({
        pegin_tx_id: stripHexPrefix(deposit.activity.txHash!),
        depositor_pk: btcPublicKey,
      });

      if (response.txs && response.txs.length > 0) {
        results.set(deposit.activity.id, response.txs);
      }
    } catch (error) {
      // Expected error: Daemon is still processing
      if (
        error instanceof Error &&
        error.message.includes("Invalid state") &&
        (error.message.includes("Acknowledged") ||
          error.message.includes("PendingChallengerSignatures"))
      ) {
        // Transactions not ready yet - continue polling
        continue;
      }
      // Log unexpected errors but don't fail the entire batch
      console.warn(`Failed to poll deposit ${deposit.activity.id}:`, error);
    }
  }
}

/**
 * Hook for polling peg-in transactions
 *
 * Manages a single polling loop for all pending deposits,
 * batching requests by vault provider.
 */
export function usePeginPollingQuery({
  activities,
  pendingPegins,
  btcPublicKey,
  vaultProviders,
}: UsePeginPollingQueryParams): UsePeginPollingQueryResult {
  // Identify deposits that need polling
  const depositsToPoll = useMemo(
    () => getDepositsNeedingPolling(activities, pendingPegins, btcPublicKey),
    [activities, pendingPegins, btcPublicKey],
  );

  // Use refs to access latest values in queryFn without stale closures
  const depositsRef = useRef(depositsToPoll);
  const providersRef = useRef(vaultProviders);
  const btcPubKeyRef = useRef(btcPublicKey);

  // Keep refs updated
  useEffect(() => {
    depositsRef.current = depositsToPoll;
    providersRef.current = vaultProviders;
    btcPubKeyRef.current = btcPublicKey;
  }, [depositsToPoll, vaultProviders, btcPublicKey]);

  // Only enable when all required data is ready:
  // - btcPublicKey from wallet
  // - deposits to poll (pending deposits)
  // - vault providers loaded (needed for RPC URLs)
  const isEnabled =
    !!btcPublicKey && depositsToPoll.length > 0 && vaultProviders.length > 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "peginPolling",
      btcPublicKey,
      depositsToPoll.map((d) => d.activity.id).join(","),
    ],
    queryFn: async () => {
      const currentDeposits = depositsRef.current;
      const currentProviders = providersRef.current;
      const currentBtcPubKey = btcPubKeyRef.current;

      if (!currentBtcPubKey || currentDeposits.length === 0) {
        return new Map<string, ClaimerTransactions[]>();
      }

      // Group by provider using current values
      const depositsByProvider = groupDepositsByProvider(
        currentDeposits,
        currentProviders,
      );

      const results = new Map<string, ClaimerTransactions[]>();

      // Fetch from each provider in parallel
      const fetchPromises = Array.from(depositsByProvider.entries()).map(
        ([, { providerUrl, deposits }]: [string, DepositsByProvider]) =>
          fetchFromProvider(providerUrl, deposits, currentBtcPubKey, results),
      );

      await Promise.all(fetchPromises);
      return results;
    },
    enabled: isEnabled,
    staleTime: 0,
    refetchInterval: (query) => {
      // Stop polling if all deposits have ready transactions
      const currentDeposits = depositsRef.current;
      const hasAllData =
        query.state.data && query.state.data.size === currentDeposits.length;
      if (hasAllData) {
        const allReady = currentDeposits.every((d) => {
          const txs = query.state.data?.get(d.activity.id);
          return txs && areTransactionsReady(txs);
        });
        if (allReady) return false;
      }
      return POLLING_INTERVAL_MS;
    },
    retry: POLLING_RETRY_COUNT,
    retryDelay: POLLING_RETRY_DELAY_MS,
  });

  // Trigger immediate fetch when query becomes enabled
  const wasEnabled = useRef(false);
  useEffect(() => {
    if (isEnabled && !wasEnabled.current) {
      // Query just became enabled, trigger immediate fetch
      refetch();
    }
    wasEnabled.current = isEnabled;
  }, [isEnabled, refetch]);

  return {
    data,
    isLoading,
    refetch,
    depositsToPoll,
  };
}
