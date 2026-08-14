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

/**
 * Protocol info for every candidate, batched.
 *
 * `getProtocolInfoBatch` runs `allowFailure: false` and throws for the WHOLE
 * batch if any single vault is unreadable (e.g. an RPC node lagging the indexer
 * returns a zeroed record). Falling back to per-vault reads keeps one bad vault
 * from gating every other VERIFIED vault the depositor holds; the bad one
 * resolves to `null` and stays gated on its own.
 */
async function readProtocolInfos(
  ids: Hex[],
): Promise<({ verifiedAt: bigint } | null)[]> {
  const reader = getVaultRegistryReader();
  try {
    return await reader.getProtocolInfoBatch(ids);
  } catch {
    return Promise.all(
      ids.map((id) => reader.getVaultProtocolInfo(id).catch(() => null)),
    );
  }
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
    // The key covers the whole candidate set, so verifying one more vault
    // changes it. Carrying the previous result across that change keeps
    // already-resolved vaults resolved instead of re-gating every one of them
    // for a round-trip — which, because a gated vault loses ACTIVATE_VAULT,
    // would blink the button off for unrelated vaults whenever a sibling
    // verifies. Vaults absent from the carried map are seeded gated below, so
    // carrying data can only preserve a decision, never invent one.
    placeholderData: (previous) => previous,
    // NEVER REJECTS. Returning the fail-closed map instead of throwing is
    // deliberate: this query is mounted app-wide, and a rejection reaches the
    // global QueryCache.onError -> logger.error -> captureException. Turning
    // the flag on where the getter is absent would then emit a Sentry event
    // every poll, for every session, forever. `useActivationDeadlineGate`
    // wraps its body for the same reason. Safety is unaffected — the map is
    // seeded gated and only a proven read can relax an entry.
    queryFn: async (): Promise<Map<string, number | null>> => {
      // `null` = gated, remaining unknown. `0` = proven open. Every candidate
      // keeps an entry so the public map below can tell "resolved open" apart
      // from "never resolved"; absence would collapse those two.
      const resolved = new Map<string, number | null>(
        candidateIds.map((id) => [id.toLowerCase(), null]),
      );

      let currentBlock: bigint;
      let peginActivationDelay: bigint;
      try {
        const paramsReader = await getProtocolParamsReader();
        [currentBlock, peginActivationDelay] = await Promise.all([
          // `cacheTime: 0` — viem caches getBlockNumber ~4s by default, and a
          // block behind head inflates the remaining count.
          ethClient.getPublicClient().getBlockNumber({ cacheTime: 0 }),
          paramsReader.getPeginActivationDelay(),
        ]);
      } catch {
        // Both inputs are global, so without them nothing can be resolved.
        return resolved;
      }

      const protocolInfos = await readProtocolInfos(candidateIds);

      candidateIds.forEach((id, i) => {
        const verifiedAt = protocolInfos[i]?.verifiedAt;
        // A VERIFIED vault always has a non-zero `verifiedAt` (the registry
        // stamps it on the ACK that completes the set). A zero or missing one
        // means this vault could not be read, so leave it gated.
        if (verifiedAt === undefined || verifiedAt === 0n) return;

        resolved.set(
          id.toLowerCase(),
          activationFloorBlocksRemaining({
            currentBlock,
            verifiedAt,
            peginActivationDelay,
          }),
        );
      });

      return resolved;
    },
  });

  return useMemo(() => {
    if (!enabled || candidateIds.length === 0) return EMPTY_GATE;
    const resolved = query.data;
    const gate = new Map<string, number | null>();
    for (const id of candidateIds) {
      const key = id.toLowerCase();
      const remaining = resolved?.get(key);
      // Unresolved in any sense gates: no data yet, a vault absent from a
      // carried-over map, or a read that could not prove anything.
      if (remaining === undefined || remaining === null) {
        gate.set(key, null);
        continue;
      }
      // Proven open (0) is omitted — absence is what downstream reads as
      // "not gated".
      if (remaining > 0) gate.set(key, remaining);
    }
    return gate;
  }, [enabled, candidateIds, query.data]);
}
