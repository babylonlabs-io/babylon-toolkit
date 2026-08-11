// Activation FLOOR gate for VERIFIED vaults — the lower bound the registry
// enforces (`_requireActivationDelayElapsed`), mirroring
// `useActivationDeadlineGate`'s upper bound. Two things differ, and both matter.
//
// 1. FAIL CLOSED. The deadline gate fails open on every error, because
//    over-gating there would lock a depositor out of a valid activation. Here
//    the risk points the other way: letting Activate through early sends the
//    HTLC secret into `simulateContract` calldata and so to the RPC provider,
//    the leak `useVaultActions` already guards against when it insists on an
//    exact-match on-chain VERIFIED. So an unresolved floor gates the vault.
//
// 2. NO WALL-CLOCK ESTIMATE. Every input is read from chain. Slot time is used
//    only to describe a block count in the UI (see `activationFloor.ts`), never
//    to decide whether the window has opened.
//
// The delay is read inside this query rather than taken from
// `ProtocolParamsContext`: that provider caches for minutes and blanks the app
// on any error it owns, while the registry reads `peginActivationDelay()` live
// on every call. Owning the read keeps the gate's decision as fresh as the
// contract's and keeps a missing getter from taking the app down with it.

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import FeatureFlags from "@/config/featureFlags";
import { ContractStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import { activationFloorBlocksRemaining } from "@/utils/activationFloor";

const ACTIVATION_FLOOR_QUERY_KEY = "activationFloorOnChain";
// The floor spans minutes, so a once-a-minute refresh is ample resolution for a
// block count and matches the dashboard's existing cadence.
const POLL_INTERVAL_MS = 60 * 1000;
const STALE_TIME_MS = 55 * 1000;

/**
 * Blocks still to wait, keyed by lowercased vault id.
 *
 * - absent → not gated (window open, or the flag is off)
 * - `number` → gated, that many blocks remain
 * - `null` → gated, duration unknown (a read failed; fail-closed)
 */
export type ActivationFloorGate = ReadonlyMap<string, number | null>;

const EMPTY_GATE: ActivationFloorGate = new Map();

/** VERIFIED vaults are the only ones the floor can apply to. */
function getVerifiedVaultIds(activities: VaultActivity[]): Hex[] {
  return activities
    .filter((a) => (a.contractStatus ?? 0) === ContractStatus.VERIFIED)
    .map((a) => a.id);
}

export function useActivationFloorGate(
  activities: VaultActivity[],
): ActivationFloorGate {
  const enabled = FeatureFlags.isActivationDelayEnabled;

  // Joined so an unchanged candidate set keeps a stable query key across
  // renders (no refetch storm from a new array identity each poll).
  const candidateKey = useMemo(
    () => (enabled ? getVerifiedVaultIds(activities).sort().join(",") : ""),
    [activities, enabled],
  );

  const candidateIds = useMemo(
    () => (candidateKey ? (candidateKey.split(",") as Hex[]) : []),
    [candidateKey],
  );

  const query = useQuery({
    queryKey: [ACTIVATION_FLOOR_QUERY_KEY, candidateKey] as const,
    // Flag off (or nothing VERIFIED) issues no contract read at all — the
    // getter is absent on deployments that predate it, so this is what keeps
    // the app quiet there.
    enabled: enabled && candidateIds.length > 0,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    queryFn: async (): Promise<Map<string, number | null>> => {
      // Fail closed: until proven otherwise every candidate is gated with an
      // unknown remainder. Success overwrites; a throw leaves this standing.
      const gated = new Map<string, number | null>(
        candidateIds.map((id) => [id.toLowerCase(), null]),
      );

      const paramsReader = await getProtocolParamsReader();
      const [currentBlock, peginActivationDelay, protocolInfos] =
        await Promise.all([
          ethClient.getPublicClient().getBlockNumber(),
          paramsReader.getPeginActivationDelay(),
          getVaultRegistryReader().getProtocolInfoBatch(candidateIds),
        ]);

      candidateIds.forEach((id, i) => {
        const key = id.toLowerCase();
        const verifiedAt = protocolInfos[i]?.verifiedAt;
        // A VERIFIED vault always has a non-zero `verifiedAt` (the registry
        // stamps it on the ACK that completes the set). A zero here means the
        // batch and the id list disagree, so stay gated rather than guess.
        if (verifiedAt === undefined || verifiedAt === 0n) return;

        const blocksRemaining = activationFloorBlocksRemaining({
          currentBlock,
          verifiedAt,
          peginActivationDelay,
        });
        if (blocksRemaining > 0) gated.set(key, blocksRemaining);
        else gated.delete(key);
      });

      return gated;
    },
  });

  return useMemo(() => {
    if (!enabled || candidateIds.length === 0) return EMPTY_GATE;
    // Unresolved in any sense gates. `isError` is checked alongside missing
    // data because React Query RETAINS the last successful result through a
    // failed background refetch — without it, a cached "floor is open" would
    // survive a governance raise that the failing refetch was meant to catch,
    // and the button would stay live on a value we can no longer confirm.
    // The cost is a briefly disabled Activate on a transient RPC blip, which
    // the next successful poll clears; the alternative is an enabled button we
    // cannot justify.
    if (!query.data || query.isError) {
      return new Map(candidateIds.map((id) => [id.toLowerCase(), null]));
    }
    return query.data;
  }, [enabled, candidateIds, query.data, query.isError]);
}
