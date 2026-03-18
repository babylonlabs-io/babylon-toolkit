/**
 * Hook for polling peg-in transactions from vault providers
 *
 * Manages the React Query polling loop for fetching claim/payout
 * transactions from all vault providers in parallel.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { logger } from "@/infrastructure";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import type { DepositorGraphTransactions } from "../../clients/vault-provider-rpc/types";
import {
  POLLING_INTERVAL_MS,
  POLLING_RETRY_COUNT,
  POLLING_RETRY_DELAY_MS,
  RPC_TIMEOUT_MS,
} from "../../config/polling";
import { DaemonStatus } from "../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { ClaimerTransactions } from "../../types";
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
  isTerminalPollingError,
} from "../../utils/peginPolling";

interface UsePeginPollingQueryParams {
  activities: VaultActivity[];
  pendingPegins: PendingPeginRequest[];
  btcPublicKey?: string;
}

/** Result from polling query */
interface PollingQueryData {
  /** Map of depositId -> transactions */
  transactions: Map<string, ClaimerTransactions[]>;
  /** Map of depositId -> depositor graph (depositor-as-claimer) */
  depositorGraphs: Map<string, DepositorGraphTransactions>;
  /** Map of depositId -> error (for deposits with provider connectivity issues) */
  errors: Map<string, Error>;
  /** Set of depositIds where vault provider needs the depositor's lamport key */
  needsLamportKey: Set<string>;
  /** Set of depositIds where VP hasn't ingested the peg-in yet */
  pendingIngestion: Set<string>;
}

interface UsePeginPollingQueryResult {
  /** Map of depositId -> transactions */
  data: Map<string, ClaimerTransactions[]> | undefined;
  /** Map of depositId -> depositor graph */
  depositorGraphs: Map<string, DepositorGraphTransactions> | undefined;
  /** Map of depositId -> error */
  errors: Map<string, Error> | undefined;
  /** Set of depositIds needing lamport key submission */
  needsLamportKey: Set<string> | undefined;
  /** Set of depositIds where VP hasn't ingested the peg-in yet */
  pendingIngestion: Set<string> | undefined;
  /** Whether any polling is in progress */
  isLoading: boolean;
  /** Trigger manual refetch */
  refetch: () => void;
  /** Deposits that are being polled */
  depositsToPoll: DepositToPoll[];
}

/**
 * Statuses where no depositor action is needed — VP is still processing
 * or has already moved past depositor interaction.
 */
const TRANSIENT_STATUSES = new Set<string>([
  DaemonStatus.PENDING_INGESTION,
  DaemonStatus.PENDING_BABE_SETUP,
  DaemonStatus.PENDING_CHALLENGER_PRESIGNING,
  DaemonStatus.PENDING_ACKS,
  DaemonStatus.PENDING_ACTIVATION,
  DaemonStatus.ACTIVATED,
]);

/**
 * Fetch status and transactions from a single vault provider for multiple deposits.
 *
 * Uses the lightweight `getPeginStatus` RPC first, then only calls
 * `requestDepositorPresignTransactions` when the VP is in the right state.
 */
async function fetchFromProvider(
  providerUrl: string,
  deposits: DepositToPoll[],
  btcPublicKey: string,
  results: Map<string, ClaimerTransactions[]>,
  depositorGraphs: Map<string, DepositorGraphTransactions>,
  errors: Map<string, Error>,
  needsLamportKey: Set<string>,
  pendingIngestion: Set<string>,
): Promise<void> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);

  for (const deposit of deposits) {
    const depositId = deposit.activity.id;
    const strippedTxid = stripHexPrefix(deposit.activity.txHash!);

    try {
      // Phase 1: Lightweight status check
      const statusResponse = await rpcClient.getPeginStatus({
        pegin_txid: strippedTxid,
      });

      const status = statusResponse.status;

      if (status === DaemonStatus.PENDING_DEPOSITOR_LAMPORT_PK) {
        needsLamportKey.add(depositId);
        errors.delete(depositId);
        continue;
      }

      if (TRANSIENT_STATUSES.has(status)) {
        errors.delete(depositId);
        needsLamportKey.delete(depositId);
        continue;
      }

      if (status === DaemonStatus.EXPIRED) {
        errors.set(depositId, new Error("Deposit expired"));
        needsLamportKey.delete(depositId);
        continue;
      }

      // Phase 2: Status is PendingDepositorSignatures — fetch transaction data
      if (status === DaemonStatus.PENDING_DEPOSITOR_SIGNATURES) {
        const response = await rpcClient.requestDepositorPresignTransactions({
          pegin_txid: strippedTxid,
          depositor_pk: btcPublicKey,
        });

        if (response.txs && response.txs.length > 0) {
          results.set(depositId, response.txs);
        }
        depositorGraphs.set(depositId, response.depositor_graph);
        errors.delete(depositId);
        needsLamportKey.delete(depositId);
        continue;
      }

      // Unknown status — clear errors and continue polling
      errors.delete(depositId);
      needsLamportKey.delete(depositId);
    } catch (error) {
      // "PegIn not found" — VP hasn't ingested yet, keep polling
      if (error instanceof Error && error.message.includes("PegIn not found")) {
        errors.delete(depositId);
        needsLamportKey.delete(depositId);
        pendingIngestion.add(depositId);
        continue;
      }

      const errorObj =
        error instanceof Error ? error : new Error("Provider unreachable");
      errors.set(depositId, errorObj);
      logger.warn(`Failed to poll deposit ${depositId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
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
}: UsePeginPollingQueryParams): UsePeginPollingQueryResult {
  // Identify deposits that need polling
  const depositsToPoll = useMemo(
    () => getDepositsNeedingPolling(activities, pendingPegins, btcPublicKey),
    [activities, pendingPegins, btcPublicKey],
  );

  // Use refs to access latest values in queryFn without stale closures
  const depositsRef = useRef(depositsToPoll);
  const btcPubKeyRef = useRef(btcPublicKey);

  // Keep refs updated
  useEffect(() => {
    depositsRef.current = depositsToPoll;
    btcPubKeyRef.current = btcPublicKey;
  }, [depositsToPoll, btcPublicKey]);

  // Only enable when all required data is ready:
  // - btcPublicKey from wallet
  // - deposits to poll (pending deposits)
  const isEnabled = !!btcPublicKey && depositsToPoll.length > 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "peginPolling",
      btcPublicKey,
      depositsToPoll.map((d) => d.activity.id).join(","),
    ],
    queryFn: async (): Promise<PollingQueryData> => {
      const currentDeposits = depositsRef.current;
      const currentBtcPubKey = btcPubKeyRef.current;

      if (!currentBtcPubKey || currentDeposits.length === 0) {
        return {
          transactions: new Map<string, ClaimerTransactions[]>(),
          depositorGraphs: new Map<string, DepositorGraphTransactions>(),
          errors: new Map<string, Error>(),
          needsLamportKey: new Set<string>(),
          pendingIngestion: new Set<string>(),
        };
      }

      // Group by provider using current values
      const depositsByProvider = groupDepositsByProvider(currentDeposits);

      const transactions = new Map<string, ClaimerTransactions[]>();
      const depositorGraphs = new Map<string, DepositorGraphTransactions>();
      const errors = new Map<string, Error>();
      const needsLamportKey = new Set<string>();
      const pendingIngestion = new Set<string>();

      // Fetch from each provider in parallel
      const fetchPromises = Array.from(depositsByProvider.entries()).map(
        ([, { providerUrl, deposits }]: [string, DepositsByProvider]) =>
          fetchFromProvider(
            providerUrl,
            deposits,
            currentBtcPubKey,
            transactions,
            depositorGraphs,
            errors,
            needsLamportKey,
            pendingIngestion,
          ),
      );

      await Promise.all(fetchPromises);
      return {
        transactions,
        depositorGraphs,
        errors,
        needsLamportKey,
        pendingIngestion,
      };
    },
    enabled: isEnabled,
    staleTime: 0,
    refetchInterval: (query) => {
      // Stop polling if any deposit has a terminal error (e.g., wallet mismatch)
      const errorMap = query.state.data?.errors;
      if (errorMap && errorMap.size > 0) {
        for (const error of errorMap.values()) {
          if (isTerminalPollingError(error)) return false;
        }
      }

      // Stop polling if all deposits have ready transactions
      const currentDeposits = depositsRef.current;
      const txMap = query.state.data?.transactions;
      const hasAllData = txMap && txMap.size === currentDeposits.length;
      if (hasAllData) {
        const allReady = currentDeposits.every((d) => {
          const txs = txMap?.get(d.activity.id);
          return txs && areTransactionsReady(txs);
        });
        if (allReady) return false;
      }
      return POLLING_INTERVAL_MS;
    },
    retry: POLLING_RETRY_COUNT,
    retryDelay: POLLING_RETRY_DELAY_MS,
    placeholderData: keepPreviousData,
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
    data: data?.transactions,
    depositorGraphs: data?.depositorGraphs,
    errors: data?.errors,
    needsLamportKey: data?.needsLamportKey,
    pendingIngestion: data?.pendingIngestion,
    isLoading,
    refetch,
    depositsToPoll,
  };
}
