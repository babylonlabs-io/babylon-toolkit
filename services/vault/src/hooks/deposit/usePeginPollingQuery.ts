/**
 * Hook for polling peg-in transactions from vault providers
 *
 * Manages the React Query polling loop for fetching the per-deposit VP daemon
 * status. The cheap, unauthenticated `getPeginStatus` RPC is the readiness
 * signal — once the daemon reports `PendingDepositorSignatures`, the deposit
 * is marked ready and the heavy auth-gated `requestDepositorPresignTransactions`
 * is deferred to the actual signing flow (`runDepositorPresignFlow`), which
 * re-fetches it at click-time.
 */

import type { GetPeginStatusResponse } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import {
  batchPollByProvider,
  DaemonStatus,
  VP_TRANSIENT_STATUSES,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { logger } from "@/infrastructure";

import {
  POLLING_INTERVAL_MS,
  POLLING_RETRY_COUNT,
  POLLING_RETRY_DELAY_MS,
} from "../../config/polling";
import type { PendingPeginRequest } from "../../storage/peginStorage";
import type { VaultActivity } from "../../types/activity";
import type {
  DepositsByProvider,
  DepositToPoll,
} from "../../types/peginPolling";
import { stripHexPrefix } from "../../utils/btc";
import {
  getDepositsNeedingPolling,
  groupDepositsByProvider,
  isTerminalPollingError,
} from "../../utils/peginPolling";
import { createVpClient } from "../../utils/rpc";

interface UsePeginPollingQueryParams {
  activities: VaultActivity[];
  pendingPegins: PendingPeginRequest[];
  btcPublicKey?: string;
}

/** Result from polling query */
interface PollingQueryData {
  /** Map of depositId -> error (for deposits with provider connectivity issues) */
  errors: Map<string, Error>;
  /** Set of depositIds where vault provider needs the depositor's WOTS key */
  needsWotsKey: Set<string>;
  /** Set of depositIds where VP hasn't ingested the peg-in yet */
  pendingIngestion: Set<string>;
  /** Set of depositIds where VP daemon reports `PendingDepositorSignatures` */
  pendingDepositorSignatures: Set<string>;
}

interface UsePeginPollingQueryResult {
  /** Map of depositId -> error */
  errors: Map<string, Error> | undefined;
  /** Set of depositIds needing WOTS key submission */
  needsWotsKey: Set<string> | undefined;
  /** Set of depositIds where VP hasn't ingested the peg-in yet */
  pendingIngestion: Set<string> | undefined;
  /** Set of depositIds where VP is ready for depositor presignatures */
  pendingDepositorSignatures: Set<string> | undefined;
  /** Whether any polling is in progress */
  isLoading: boolean;
  /** Trigger manual refetch */
  refetch: () => void;
  /** Deposits that are being polled */
  depositsToPoll: DepositToPoll[];
}

/**
 * Fetch status from a single vault provider via `batchGetPeginStatus`,
 * chunked at `VP_BATCH_MAX_SIZE`. Defensive attribution + duplicate-skip
 * + per-item dispatch live in the SDK's `batchPollByProvider`; this
 * function only declares the per-item handlers.
 *
 * Unauthenticated RPC. The presign transaction payload is fetched at
 * signing time by the SDK's `runDepositorPresignFlow`.
 */
async function fetchFromProvider(
  providerAddress: string,
  deposits: DepositToPoll[],
  errors: Map<string, Error>,
  needsWotsKey: Set<string>,
  pendingIngestion: Set<string>,
  pendingDepositorSignatures: Set<string>,
): Promise<void> {
  const rpcClient = createVpClient(providerAddress);
  await batchPollByProvider<DepositToPoll, GetPeginStatusResponse>({
    items: deposits,
    getTxid: (deposit) => stripHexPrefix(deposit.activity.peginTxHash!),
    batchCall: (pegin_txids) => rpcClient.batchGetPeginStatus({ pegin_txids }),
    onItem: (deposit, envelope) => {
      const depositId = deposit.activity.id;
      if (envelope.error !== null) {
        // "PegIn not found" is a routine pre-ingest signal, not a fault.
        if (!envelope.error.includes("PegIn not found")) {
          logger.warn(`Failed to poll deposit ${depositId}`, {
            error: envelope.error,
          });
        }
        applyPerDepositError(envelope.error, depositId, {
          errors,
          needsWotsKey,
          pendingIngestion,
        });
        return;
      }
      // envelope.result is non-null here by the validator's XOR invariant.
      applyPerDepositStatus(envelope.result!, depositId, {
        errors,
        needsWotsKey,
        pendingIngestion,
        pendingDepositorSignatures,
      });
    },
    onMissing: (deposit) =>
      errors.set(
        deposit.activity.id,
        new Error("Provider omitted status entry"),
      ),
    onDuplicate: (deposit) =>
      errors.set(
        deposit.activity.id,
        new Error("Provider returned duplicate status entry"),
      ),
    onDuplicateBatch: (count) =>
      logger.warn(
        `VP ${providerAddress} returned ${count} duplicate pegin txid(s); marking those deposits errored`,
      ),
    onWholeBatchError: (chunk, error) => {
      const errorObj =
        error instanceof Error ? error : new Error("Provider unreachable");
      const detail =
        error instanceof VpResponseValidationError
          ? error.detail
          : errorObj.message;
      logger.warn(
        `Failed to poll ${chunk.length} deposit(s) from VP ${providerAddress}`,
        { error: detail },
      );
      for (const deposit of chunk) {
        errors.set(deposit.activity.id, errorObj);
      }
    },
    onUnexpected: (echoed) =>
      logger.warn(
        `VP ${providerAddress} returned ${echoed.length} unexpected pegin txid(s); ignoring`,
      ),
  });
}

interface DepositSets {
  errors: Map<string, Error>;
  needsWotsKey: Set<string>;
  pendingIngestion: Set<string>;
}

function applyPerDepositError(
  errorMessage: string,
  depositId: string,
  sets: DepositSets,
): void {
  // "PegIn not found" — VP hasn't ingested yet, treat as still-pending.
  if (errorMessage.includes("PegIn not found")) {
    sets.errors.delete(depositId);
    sets.needsWotsKey.delete(depositId);
    sets.pendingIngestion.add(depositId);
    return;
  }
  sets.errors.set(depositId, new Error(errorMessage));
}

function applyPerDepositStatus(
  statusResponse: GetPeginStatusResponse,
  depositId: string,
  sets: DepositSets & { pendingDepositorSignatures: Set<string> },
): void {
  const status = statusResponse.status;

  if (status === DaemonStatus.PENDING_DEPOSITOR_WOTS_PK) {
    sets.needsWotsKey.add(depositId);
    sets.errors.delete(depositId);
    return;
  }

  if (status === DaemonStatus.PENDING_INGESTION) {
    sets.pendingIngestion.add(depositId);
    sets.errors.delete(depositId);
    sets.needsWotsKey.delete(depositId);
    return;
  }

  if (VP_TRANSIENT_STATUSES.has(status as DaemonStatus)) {
    sets.errors.delete(depositId);
    sets.needsWotsKey.delete(depositId);
    return;
  }

  if (status === DaemonStatus.EXPIRED) {
    sets.errors.set(depositId, new Error("Deposit expired"));
    sets.needsWotsKey.delete(depositId);
    return;
  }

  if (status === DaemonStatus.CLAIM_POSTED) {
    sets.errors.set(depositId, new Error("Claim transaction posted"));
    sets.needsWotsKey.delete(depositId);
    return;
  }

  if (status === DaemonStatus.PEGGED_OUT) {
    sets.errors.set(depositId, new Error("BTC has been returned to depositor"));
    sets.needsWotsKey.delete(depositId);
    return;
  }

  // VP daemon reached the depositor-signing state. The status alone is
  // a sufficient readiness signal — the daemon only enters this state
  // after `all_presigning_phases_complete`, so the depositor-presign RPC
  // is guaranteed to succeed when the user clicks Sign Payouts.
  if (status === DaemonStatus.PENDING_DEPOSITOR_SIGNATURES) {
    sets.pendingDepositorSignatures.add(depositId);
    sets.errors.delete(depositId);
    sets.needsWotsKey.delete(depositId);
    return;
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
          errors: new Map<string, Error>(),
          needsWotsKey: new Set<string>(),
          pendingIngestion: new Set<string>(),
          pendingDepositorSignatures: new Set<string>(),
        };
      }

      // Group by provider using current values
      const depositsByProvider = groupDepositsByProvider(currentDeposits);

      const errors = new Map<string, Error>();
      const needsWotsKey = new Set<string>();
      const pendingIngestion = new Set<string>();
      const pendingDepositorSignatures = new Set<string>();

      // Fetch from each provider in parallel
      const fetchPromises = Array.from(depositsByProvider.entries()).map(
        ([, { providerAddress, deposits }]: [string, DepositsByProvider]) =>
          fetchFromProvider(
            providerAddress,
            deposits,
            errors,
            needsWotsKey,
            pendingIngestion,
            pendingDepositorSignatures,
          ),
      );

      await Promise.all(fetchPromises);
      return {
        errors,
        needsWotsKey,
        pendingIngestion,
        pendingDepositorSignatures,
      };
    },
    enabled: isEnabled,
    staleTime: 0,
    refetchInterval: (query) => {
      const currentDeposits = depositsRef.current;
      if (currentDeposits.length === 0) return false;

      const readySet = query.state.data?.pendingDepositorSignatures;
      const errorMap = query.state.data?.errors;

      // Stop polling only when every deposit is resolved:
      // either reached the depositor-signing state (VP has presign txs ready)
      // or hit a terminal error.
      const allResolved = currentDeposits.every((d) => {
        const depositId = d.activity.id;
        if (readySet?.has(depositId)) return true;
        const error = errorMap?.get(depositId);
        if (error && isTerminalPollingError(error)) return true;
        return false;
      });
      if (allResolved) return false;

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
    errors: data?.errors,
    needsWotsKey: data?.needsWotsKey,
    pendingIngestion: data?.pendingIngestion,
    pendingDepositorSignatures: data?.pendingDepositorSignatures,
    isLoading,
    refetch,
    depositsToPoll,
  };
}
