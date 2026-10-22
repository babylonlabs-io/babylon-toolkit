// On-chain check of the vaults the indexer reports ACTIVE.
//
// The indexer's `available` status maps straight to ACTIVE. A false or early
// ACTIVE shows terminal activation success, drops the vault from the pending
// list and hides its Activate action, while the registry still holds it
// Verified. So a vault the registry still reports PENDING or VERIFIED takes
// that status instead of the indexer's. Other registry statuses do not
// override the indexer.
//
// Fails OPEN, like `useStuckVaultChainConfirm`: a failed read keeps the
// indexer's ACTIVE. Failing closed would offer Activate, and a wallet prompt,
// on every healthy active vault while the RPC is down. A failed refetch of an
// unchanged id set keeps the last result, for up to one poll. A read that has
// not settled is reported in `pendingIds`, so the caller can hold the vault
// instead of acting on an ACTIVE the chain may still refuse.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Hex, zeroAddress } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";
import { shortId } from "@/infrastructure/telemetryEvents";
import { ContractStatus } from "@/models/peginStateMachine";

const ACTIVE_VAULT_CHAIN_CHECK_QUERY_KEY = "activeVaultChainCheck";
// Matches the other chain gates so the reads batch together. A new id set
// changes the query key, so a vault that just turned ACTIVE is read at once.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;

/** Registry statuses that precede activation, as app-side statuses. */
const PRE_ACTIVATION_STATUSES: ReadonlyMap<number, ContractStatus> = new Map([
  [OnChainBtcVaultStatus.PENDING, ContractStatus.PENDING],
  [OnChainBtcVaultStatus.VERIFIED, ContractStatus.VERIFIED],
]);

interface ChainCheckResult {
  /** Lowercased ids this read covered, including the reads that failed. */
  checked: ReadonlySet<string>;
  statuses: ReadonlyMap<string, ContractStatus>;
}

export interface ActiveVaultChainCheck {
  /**
   * For each indexer-ACTIVE vault the registry has not activated, its on-chain
   * status (PENDING or VERIFIED), keyed by lowercased vault id. An absent id
   * means the chain agrees, the read failed, or the read has not settled.
   */
  statuses: ReadonlyMap<string, ContractStatus>;
  /** Lowercased ids whose read has not settled yet. */
  pendingIds: ReadonlySet<string>;
}

export function useActiveVaultChainCheck(
  activeIds: readonly Hex[],
): ActiveVaultChainCheck {
  // Joined so an unchanged id set keeps a stable query key across renders.
  const idsKey = useMemo(() => [...activeIds].sort().join(","), [activeIds]);

  const query = useQuery({
    queryKey: [ACTIVE_VAULT_CHAIN_CHECK_QUERY_KEY, idsKey] as const,
    enabled: idsKey.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // Keep the last result while a new id set loads, so a vault the chain
    // already refused does not flip back to ACTIVE for that window. Ids the
    // last result did not cover are reported pending until the new read
    // settles.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ChainCheckResult> => {
      const reader = getVaultRegistryReader();
      const ids = idsKey.split(",") as Hex[];
      // Per-vault reads coalesce into one Multicall3 round-trip (client batch).
      const records = await Promise.all(
        ids.map(async (id) => {
          try {
            return { id, basic: await reader.getVaultBasicInfo(id) };
          } catch (error) {
            // Transient RPC error → keep the indexer's status.
            logger.warn("Active vault registry read failed", {
              category: "activation",
              vaultId: shortId(id),
              cause: String(error),
            });
            return null;
          }
        }),
      );
      const statuses = new Map<string, ContractStatus>();
      for (const record of records) {
        if (!record || record.basic.depositor === zeroAddress) continue;
        const status = PRE_ACTIVATION_STATUSES.get(record.basic.status);
        if (status !== undefined) statuses.set(record.id.toLowerCase(), status);
      }
      return {
        checked: new Set(ids.map((id) => id.toLowerCase())),
        statuses,
      };
    },
  });

  const { data, isError } = query;
  return useMemo(() => {
    const current = new Set(activeIds.map((id) => id.toLowerCase()));
    const statuses = new Map<string, ContractStatus>();
    for (const [id, status] of data?.statuses ?? []) {
      if (current.has(id)) statuses.set(id, status);
    }
    // A query that failed as a whole settles every id at the indexer status.
    const pendingIds = new Set(
      isError ? [] : [...current].filter((id) => !data?.checked.has(id)),
    );
    return { statuses, pendingIds };
  }, [data, isError, activeIds]);
}
