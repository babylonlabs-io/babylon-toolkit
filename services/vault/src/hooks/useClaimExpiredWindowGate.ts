// On-chain grace window for redeeming expired vaults the PegIn swept.
//
// An expired vault whose Pre-PegIn HTLC the PegIn spent can no longer be
// refunded; `claimExpiredVault` is its only exit, and the registry accepts it
// only until the vault's frozen `claimExpiredUntil` block. This reads that
// block, the vault's on-chain status and the chain head for the suspects the
// BTC-side probe found, so the row can show the deadline — and stop offering
// the redeem once the chain says it is gone.
//
// UX only. The registry enforces the window, and the redeem's confirm step
// re-reads every input before the secret is used.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import type { ClaimExpiredWindow } from "@/models/peginStateMachine";

const CLAIM_EXPIRED_WINDOW_QUERY_KEY = "claimExpiredWindowOnChain";
// The window is measured in days of blocks, so a once-a-minute read is ample.
// Matches the other chain gates so the reads batch together.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;

const EMPTY_MAP: ReadonlyMap<string, ClaimExpiredWindow> = new Map();

/**
 * Classifies one vault's on-chain record. Returns `undefined` when the record
 * does not settle the window — the caller then treats it as unknown.
 */
export function classifyClaimExpiredWindow(params: {
  status: number;
  verifiedAt: bigint;
  claimExpiredUntil: bigint;
  head: bigint | null;
}): ClaimExpiredWindow | undefined {
  const { status, verifiedAt, claimExpiredUntil, head } = params;
  if (status === OnChainBtcVaultStatus.REDEEMED) return { state: "redeemed" };
  if (status !== OnChainBtcVaultStatus.EXPIRED) return undefined;
  // Expired without verification: the registry rejects the redeem outright.
  if (verifiedAt === 0n) return { state: "closed" };
  if (head === null) return undefined;
  // The registry accepts `block.number <= claimExpiredUntil`, but a redeem
  // sent now is mined in a later block than the head. At head ==
  // claimExpiredUntil it would revert after paying gas — while the
  // pre-broadcast simulation, which runs at the head, still passes.
  if (head >= claimExpiredUntil) return { state: "closed" };
  return {
    state: "open",
    blocksRemaining: Number(claimExpiredUntil - head),
  };
}

/**
 * The grace window of each suspect, keyed by lowercased vault id.
 *
 * Fails OPEN on everything it cannot establish: an id absent from the map is an
 * unknown window, and an unknown window keeps the redeem offered. Withholding
 * the only exit over a failed RPC read strands the depositor; offering it past
 * the deadline costs at most a confirm step that re-reads the window and
 * refuses before any write (see `useClaimExpiredVault` for the one case it
 * cannot read).
 */
export function useClaimExpiredWindowGate(
  suspectIds: readonly Hex[],
): ReadonlyMap<string, ClaimExpiredWindow> {
  // Joined so an unchanged suspect set keeps a stable query key across renders.
  const suspectKey = useMemo(
    () => [...suspectIds].sort().join(","),
    [suspectIds],
  );

  const query = useQuery({
    queryKey: [CLAIM_EXPIRED_WINDOW_QUERY_KEY, suspectKey] as const,
    enabled: suspectKey.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // A changed suspect set (another vault swept, or one redeemed) changes the
    // key. Keep the previous windows while the new key loads: dropping them
    // would read every window as unknown and re-offer the redeem — and its
    // notification — on vaults the chain already reported closed or redeemed.
    // Carrying them over is safe: the intersection below keeps only current
    // suspects, and a closed or redeemed window never reopens.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, ClaimExpiredWindow>> => {
      const reader = getVaultRegistryReader();
      const ids = suspectKey.split(",") as Hex[];
      // Per-vault reads coalesce into one Multicall3 round-trip (client batch).
      const [head, records] = await Promise.all([
        ethClient
          .getPublicClient()
          .getBlockNumber({ cacheTime: 0 })
          // An unreadable head still lets the status reads settle the
          // redeemed and never-verified cases.
          .catch(() => null),
        Promise.all(
          ids.map(async (id) => {
            try {
              return { id, data: await reader.getVaultData(id) };
            } catch {
              // Not on chain / transient RPC error → unknown.
              return null;
            }
          }),
        ),
      ]);

      const windows = new Map<string, ClaimExpiredWindow>();
      for (const record of records) {
        if (!record) continue;
        const claimWindow = classifyClaimExpiredWindow({
          status: record.data.basic.status,
          verifiedAt: record.data.protocol.verifiedAt,
          claimExpiredUntil: record.data.protocol.claimExpiredUntil,
          head,
        });
        if (claimWindow) windows.set(record.id.toLowerCase(), claimWindow);
      }
      return windows;
    },
  });

  // Intersect with the live suspect set so a window can never outlive the
  // suspicion that produced it (React Query retains data per key).
  const windows = query.data;
  return useMemo(() => {
    if (!windows || windows.size === 0 || suspectIds.length === 0) {
      return EMPTY_MAP;
    }
    const current = new Set(suspectIds.map((id) => id.toLowerCase()));
    const gated = new Map<string, ClaimExpiredWindow>();
    for (const [id, claimWindow] of windows) {
      if (current.has(id)) gated.set(id, claimWindow);
    }
    return gated;
  }, [windows, suspectIds]);
}
