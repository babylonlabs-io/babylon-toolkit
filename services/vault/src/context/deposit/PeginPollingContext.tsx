/**
 * Centralized Peg-In Polling Context
 *
 * This context manages polling for payout transactions across ALL pending deposits
 * from a single location, eliminating per-row hook instantiation.
 *
 * Key benefits:
 * - Single polling interval for all deposits (vs N intervals for N deposits)
 * - Batched RPC calls by vault provider
 * - Shared state across all table rows and cells
 * - Automatic cleanup when deposits change status
 */

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import {
  ContractStatus,
  getPeginState,
  LocalStorageStatus,
} from "../../models/peginStateMachine";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { ClaimerTransactions, VaultProvider } from "../../types";
import type { VaultActivity } from "../../types/activity";
import { stripHexPrefix } from "../../utils/btc";

/** Result of polling for a single deposit */
export interface DepositPollingResult {
  /** Deposit/activity ID (txHash) */
  depositId: string;
  /** Claim and payout transactions (null if not ready) */
  transactions: ClaimerTransactions[] | null;
  /** Whether transactions are ready for signing */
  isReady: boolean;
  /** Loading state for this deposit */
  loading: boolean;
  /** Error state for this deposit */
  error: Error | null;
  /** Current state from pegin state machine */
  peginState: ReturnType<typeof getPeginState>;
}

/** Context value type */
interface PeginPollingContextValue {
  /** Get polling result for a specific deposit */
  getPollingResult: (depositId: string) => DepositPollingResult | undefined;
  /** Global loading state (any deposit is loading) */
  isLoading: boolean;
  /** Trigger a manual refetch for all deposits */
  refetch: () => void;
}

const PeginPollingContext = createContext<PeginPollingContextValue | null>(
  null,
);

/** Provider props */
interface PeginPollingProviderProps extends PropsWithChildren {
  /** All activities to potentially poll */
  activities: VaultActivity[];
  /** Pending pegins from localStorage */
  pendingPegins: PendingPeginRequest[];
  /** Depositor's BTC public key (x-only, 32 bytes without 0x prefix) */
  btcPublicKey?: string;
  /** Vault providers data (pre-fetched at page level) */
  vaultProviders: VaultProvider[];
}

/**
 * Check if transactions response has all required data
 */
function areTransactionsReady(txs: ClaimerTransactions[]): boolean {
  if (!txs || txs.length === 0) return false;
  return txs.every(
    (tx) =>
      tx.claim_tx?.tx_hex &&
      tx.payout_tx?.tx_hex &&
      tx.claim_tx.tx_hex.length > 0 &&
      tx.payout_tx.tx_hex.length > 0,
  );
}

/**
 * Centralized Peg-In Polling Provider
 *
 * Manages a single polling loop for all pending deposits instead of
 * creating N polling hooks for N deposits.
 */
export function PeginPollingProvider({
  children,
  activities,
  pendingPegins,
  btcPublicKey,
  vaultProviders,
}: PeginPollingProviderProps) {
  // Step 1: Identify which deposits need polling
  // Poll when: PENDING status, not yet signed, have required data
  const depositsToPolll = useMemo(() => {
    return activities
      .map((activity) => {
        const pendingPegin = pendingPegins.find((p) => p.id === activity.id);
        const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
        const localStatus = pendingPegin?.status as
          | LocalStorageStatus
          | undefined;
        const vaultProviderAddress = activity.providers[0]?.id as
          | Hex
          | undefined;

        // Check if this deposit should be polled
        const shouldPoll =
          contractStatus === ContractStatus.PENDING &&
          localStatus !== LocalStorageStatus.PAYOUT_SIGNED &&
          !!btcPublicKey &&
          !!vaultProviderAddress &&
          !!activity.txHash &&
          !!activity.applicationController;

        return {
          activity,
          pendingPegin,
          shouldPoll,
          vaultProviderAddress,
        };
      })
      .filter((d) => d.shouldPoll);
  }, [activities, pendingPegins, btcPublicKey]);

  // Step 2: Group deposits by vault provider URL for batching
  const depositsByProvider = useMemo(() => {
    const grouped = new Map<
      string,
      {
        providerUrl: string;
        deposits: typeof depositsToPolll;
      }
    >();

    for (const deposit of depositsToPolll) {
      const provider = vaultProviders.find(
        (p) =>
          p.id.toLowerCase() === deposit.vaultProviderAddress?.toLowerCase(),
      );

      if (!provider?.url) continue;

      const existing = grouped.get(provider.url);
      if (existing) {
        existing.deposits.push(deposit);
      } else {
        grouped.set(provider.url, {
          providerUrl: provider.url,
          deposits: [deposit],
        });
      }
    }

    return grouped;
  }, [depositsToPolll, vaultProviders]);

  // Step 3: Single polling query that fetches from all providers
  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "peginPolling",
      btcPublicKey,
      // Include deposit IDs to trigger refetch when deposits change
      depositsToPolll.map((d) => d.activity.id).join(","),
    ],
    queryFn: async () => {
      if (!btcPublicKey || depositsToPolll.length === 0) {
        return new Map<string, ClaimerTransactions[]>();
      }

      const results = new Map<string, ClaimerTransactions[]>();

      // Fetch from each provider in parallel
      const fetchPromises = Array.from(depositsByProvider.entries()).map(
        async ([, { providerUrl, deposits }]) => {
          const rpcClient = new VaultProviderRpcApi(providerUrl, 30000);

          // Fetch each deposit from this provider
          // Note: Could be optimized further if provider supports batch requests
          for (const deposit of deposits) {
            try {
              const response =
                await rpcClient.requestClaimAndPayoutTransactions({
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
              console.warn(
                `Failed to poll deposit ${deposit.activity.id}:`,
                error,
              );
            }
          }
        },
      );

      await Promise.all(fetchPromises);
      return results;
    },
    enabled: !!btcPublicKey && depositsToPolll.length > 0,
    // Poll every 30 seconds
    refetchInterval: (query) => {
      // Stop polling if all deposits have ready transactions
      if (
        query.state.data &&
        query.state.data.size === depositsToPolll.length
      ) {
        const allReady = depositsToPolll.every((d) => {
          const txs = query.state.data?.get(d.activity.id);
          return txs && areTransactionsReady(txs);
        });
        if (allReady) return false;
      }
      return 30000;
    },
    retry: 3,
    retryDelay: 5000,
  });

  // Step 4: Build lookup function for individual deposit results
  const getPollingResult = useCallback(
    (depositId: string): DepositPollingResult | undefined => {
      const activity = activities.find((a) => a.id === depositId);
      if (!activity) return undefined;

      const pendingPegin = pendingPegins.find((p) => p.id === depositId);
      const contractStatus = (activity.contractStatus ?? 0) as ContractStatus;
      const localStatus = pendingPegin?.status as
        | LocalStorageStatus
        | undefined;

      const transactions = data?.get(depositId) ?? null;
      const isReady = transactions ? areTransactionsReady(transactions) : false;

      const peginState = getPeginState(contractStatus, {
        localStatus,
        transactionsReady: isReady,
        isInUse: activity.isInUse,
      });

      return {
        depositId,
        transactions,
        isReady,
        loading: isLoading,
        error: null,
        peginState,
      };
    },
    [activities, pendingPegins, data, isLoading],
  );

  const contextValue = useMemo(
    () => ({
      getPollingResult,
      isLoading,
      refetch: () => {
        refetch();
      },
    }),
    [getPollingResult, isLoading, refetch],
  );

  return (
    <PeginPollingContext.Provider value={contextValue}>
      {children}
    </PeginPollingContext.Provider>
  );
}

/**
 * Hook to access the centralized polling context
 *
 * Must be used within a PeginPollingProvider
 */
export function usePeginPolling() {
  const context = useContext(PeginPollingContext);
  if (!context) {
    throw new Error(
      "usePeginPolling must be used within a PeginPollingProvider",
    );
  }
  return context;
}

/**
 * Hook to get polling result for a specific deposit
 *
 * This is a convenience hook that wraps getPollingResult.
 * Components can use this instead of calling getPollingResult directly.
 */
export function useDepositPollingResult(depositId: string) {
  const { getPollingResult } = usePeginPolling();
  return getPollingResult(depositId);
}
