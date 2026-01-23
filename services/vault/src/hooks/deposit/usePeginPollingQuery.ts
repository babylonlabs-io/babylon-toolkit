/**
 * Hook for polling peg-in transactions from vault providers
 *
 * Manages the React Query polling loop for fetching claim/payout
 * transactions from all vault providers in parallel.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import {
  type DaemonProgress,
  DaemonStatus,
  isPreDepositorSignaturesError,
} from "../../models/peginStateMachine";
import { checkPeginStatus } from "../../services/vault/vaultPeginStatusService";
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

/** Result entry for a single deposit's polling data */
export interface PollingResultEntry {
  /** Claim and payout transactions (null if not ready) */
  transactions: ClaimerTransactions[] | null;
  /** Daemon status from vault provider */
  daemonStatus?: DaemonStatus;
  /** Progress information (completed/total challengers) */
  daemonProgress?: DaemonProgress;
}

interface UsePeginPollingQueryParams {
  activities: VaultActivity[];
  pendingPegins: PendingPeginRequest[];
  btcPublicKey?: string;
  vaultProviders: VaultProvider[];
}

interface UsePeginPollingQueryResult {
  /** Map of depositId -> polling result entry */
  data: Map<string, PollingResultEntry> | undefined;
  /** Whether any polling is in progress */
  isLoading: boolean;
  /** Trigger manual refetch */
  refetch: () => void;
  /** Deposits that are being polled */
  depositsToPoll: DepositToPoll[];
}

/**
 * Extract progress from daemon status result
 */
function extractProgress(
  statusResult: Awaited<ReturnType<typeof checkPeginStatus>>,
): DaemonProgress | undefined {
  const { status, progress } = statusResult;

  // Map status to the relevant progress field
  if (status === DaemonStatus.PENDING_GC_DATA && progress.gc_data) {
    return {
      completed: progress.gc_data.completed_challengers,
      total: progress.gc_data.total_challengers,
    };
  }
  if (
    status === DaemonStatus.PENDING_CHALLENGER_PRESIGNING &&
    progress.presigning
  ) {
    return {
      completed: progress.presigning.completed_challengers,
      total: progress.presigning.total_challengers,
    };
  }
  if (status === DaemonStatus.PENDING_ACKS && progress.ack_collection) {
    return {
      completed: progress.ack_collection.completed_challengers,
      total: progress.ack_collection.total_challengers,
    };
  }
  return undefined;
}

/**
 * Fetch transactions and status from a single vault provider for multiple deposits
 */
async function fetchFromProvider(
  providerUrl: string,
  providerAddress: string,
  deposits: DepositToPoll[],
  btcPublicKey: string,
  results: Map<string, PollingResultEntry>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  for (const deposit of deposits) {
    const depositId = deposit.activity.id;
    const peginTxId = deposit.activity.txHash!;

    // Initialize result entry
    const entry: PollingResultEntry = {
      transactions: null,
    };

    // Fetch status (always attempt, even if transactions fail)
    try {
      const statusResult = await checkPeginStatus(peginTxId, {
        address: providerAddress as `0x${string}`,
        url: providerUrl,
      });
      entry.daemonStatus = statusResult.status;
      entry.daemonProgress = extractProgress(statusResult);
    } catch (error) {
      // Status fetch failed - log but continue
      console.warn(`Failed to fetch status for deposit ${depositId}:`, error);
    }

    // Fetch transactions
    try {
      const response = await rpcClient.requestDepositorPresignTransactions({
        pegin_txid: stripHexPrefix(peginTxId),
        depositor_pk: btcPublicKey,
      });

      if (response.txs && response.txs.length > 0) {
        entry.transactions = response.txs;
      }
    } catch (error) {
      // Expected error: Daemon is still processing (before PendingDepositorSignatures)
      if (isPreDepositorSignaturesError(error)) {
        // Transactions not ready yet - continue polling
      } else {
        // Log unexpected errors but don't fail the entire batch
        console.warn(`Failed to poll deposit ${depositId}:`, error);
      }
    }

    // Always set result even if only status is available
    results.set(depositId, entry);
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
        return new Map<string, PollingResultEntry>();
      }

      // Group by provider using current values
      const depositsByProvider = groupDepositsByProvider(
        currentDeposits,
        currentProviders,
      );

      const results = new Map<string, PollingResultEntry>();

      // Fetch from each provider in parallel
      const fetchPromises = Array.from(depositsByProvider.entries()).map(
        ([providerAddress, { providerUrl, deposits }]: [
          string,
          DepositsByProvider,
        ]) =>
          fetchFromProvider(
            providerUrl,
            providerAddress,
            deposits,
            currentBtcPubKey,
            results,
          ),
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
          const entry = query.state.data?.get(d.activity.id);
          return (
            entry?.transactions && areTransactionsReady(entry.transactions)
          );
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
