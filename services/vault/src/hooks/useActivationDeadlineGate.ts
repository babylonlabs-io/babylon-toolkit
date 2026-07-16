// Tiered activation-deadline gate for VERIFIED vaults (UX only — the contract
// is the real gate and reverts ActivationDeadlineExpired).
//
// Tier 1 (no RPC): the indexer createdAt timestamp + slot time give an UPPER
// bound on elapsed blocks; only vaults the cheap estimate flags as MAYBE past
// the window are escalated.
// Tier 2 (suspects only): every input — current block, live timeout, on-chain
// createdAt — is read from chain, so the gate can never be stricter than the
// contract. Only a confirmed TRUE gates Activate; any error leaves it ungated.

import { OnChainBtcVaultStatus } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { isActivationDeadlinePassedOnChain } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { type Hex, zeroAddress } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import {
  getProtocolParamsReader,
  getVaultRegistryReader,
} from "@/clients/eth-contract/sdk-readers";
import { ContractStatus } from "@/models/peginStateMachine";
import type { VaultActivity } from "@/types/activity";
import { estimateActivationDeadlineLikelyPassed } from "@/utils/activationDeadline";

const ACTIVATION_DEADLINE_QUERY_KEY = "activationDeadlineOnChain";
// Refresh on the dashboard cadence; the gate moves slowly (deadline is measured
// in blocks) so a once-a-minute confirm is ample.
const POLL_INTERVAL_MS = 60 * 1000;
// Just under the poll interval so refocus/remount doesn't double-fetch.
const STALE_TIME_MS = 55 * 1000;
// Tier-1's `now` must advance on a clock, not on data identity: an idle VERIFIED
// vault's payload stops changing, so `activities` keeps a stable reference.
const TIER1_CLOCK_TICK_MS = POLL_INTERVAL_MS;

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Tier-1 suspects: VERIFIED vaults whose cheap, no-RPC estimate says the
 * activation window MAY have closed. A vault with no indexer timestamp can't be
 * estimated, so it is not flagged (fail-safe — left activatable).
 */
export function getActivationDeadlineSuspects(
  activities: VaultActivity[],
  pegInActivationTimeout: bigint,
  nowMs: number,
): Hex[] {
  const suspects: Hex[] = [];
  for (const activity of activities) {
    if ((activity.contractStatus ?? 0) !== ContractStatus.VERIFIED) continue;
    if (activity.timestamp === undefined) continue;
    if (
      estimateActivationDeadlineLikelyPassed({
        createdAtMs: activity.timestamp,
        nowMs,
        pegInActivationTimeout,
      })
    ) {
      suspects.push(activity.id);
    }
  }
  return suspects;
}

/**
 * Lowercased ids of VERIFIED vaults confirmed (on chain) past their activation
 * deadline. An absent id means "not gated" — the set is empty until a Tier-2
 * read confirms, and stays empty on any RPC error or missing param (fail-safe).
 */
export function useActivationDeadlineGate(
  activities: VaultActivity[],
  pegInActivationTimeout: bigint | undefined,
): ReadonlySet<string> {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), TIER1_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Tier 1: cheap suspect filter on the CACHED timeout — fine because Tier-2
  // re-checks every suspect against the live value; a stale cache only ever
  // under-suspects (fail-open), never gates. Joined so an unchanged suspect set
  // keeps a stable identity across clock ticks (no downstream re-render storm).
  const suspectKey = useMemo(() => {
    if (!pegInActivationTimeout) return "";
    return getActivationDeadlineSuspects(
      activities,
      pegInActivationTimeout,
      nowMs,
    )
      .sort()
      .join(",");
  }, [activities, pegInActivationTimeout, nowMs]);

  const suspectIds = useMemo(
    () => (suspectKey ? (suspectKey.split(",") as Hex[]) : []),
    [suspectKey],
  );

  // Timeout is part of the key: a governance change to pegInActivationTimeout
  // must invalidate any cached on-chain confirmation computed under the old one.
  const queryKey = useMemo(
    () =>
      [
        ACTIVATION_DEADLINE_QUERY_KEY,
        pegInActivationTimeout?.toString() ?? "none",
        suspectKey,
      ] as const,
    [pegInActivationTimeout, suspectKey],
  );

  const query = useQuery({
    queryKey,
    enabled: suspectIds.length > 0 && pegInActivationTimeout !== undefined,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    // No placeholderData: when the suspect set or timeout changes the key, the
    // gate must FAIL OPEN (no data → nothing gated) until Tier-2 reconfirms,
    // rather than carry a confirmation computed under the old inputs — which
    // could briefly lock out a now-valid vault. Background refetches on an
    // unchanged key keep their data, so steady-state gating doesn't flicker.
    queryFn: async (): Promise<Set<string>> => {
      try {
        const reader = getVaultRegistryReader();
        const paramsReader = await getProtocolParamsReader();
        // The timeout is governance-mutable and the registry reads it live, so a
        // page-load-cached copy could gate a vault the contract would accept.
        const [currentBlock, tbvParams] = await Promise.all([
          ethClient.getPublicClient().getBlockNumber(),
          paramsReader.getTBVProtocolParams(),
        ]);
        const liveActivationTimeout = tbvParams.pegInActivationTimeout;
        if (!liveActivationTimeout) return new Set();
        // The per-suspect reads coalesce into one Multicall3 round-trip (client
        // batch); the block/params reads above are a separate round-trip.
        const infos = await Promise.all(
          suspectIds.map(async (id) => {
            try {
              return { id, info: await reader.getVaultBasicInfo(id) };
            } catch {
              // Vault not yet on chain / transient RPC error → don't gate.
              return null;
            }
          }),
        );
        const passed = new Set<string>();
        for (const entry of infos) {
          if (!entry) continue;
          const { id, info } = entry;
          // Unregistered / zero record → can't trust createdAt; don't gate.
          if (info.depositor === zeroAddress || info.createdAt === 0n) continue;
          // Gate only vaults the chain still reports VERIFIED. A stale indexer
          // VERIFIED row for an already-ACTIVE/REDEEMED/EXPIRED vault must not be
          // badged Expired from the deadline alone.
          if (info.status !== OnChainBtcVaultStatus.VERIFIED) continue;
          if (
            isActivationDeadlinePassedOnChain({
              currentBlock,
              createdAtBlock: info.createdAt,
              pegInActivationTimeout: liveActivationTimeout,
            })
          ) {
            passed.add(id.toLowerCase());
          }
        }
        return passed;
      } catch {
        // Block/params read failed. Reject would let React Query retain the
        // prior (possibly stale) gated set on a background refetch; return empty
        // so any read failure fails OPEN, never gating a now-valid vault.
        return new Set();
      }
    },
  });

  // Invariant guard: gate only vaults that are STILL current Tier-1 suspects.
  // A vault Tier-1 no longer flags is definitely within the window (the estimate
  // is an upper bound on elapsed blocks), so intersecting with the live suspect
  // set ensures a confirmation can never outlive Tier-1 suspicion — e.g. data
  // React Query retains for a key while the query is disabled.
  const confirmed = query.data;
  return useMemo(() => {
    if (!confirmed || confirmed.size === 0 || suspectIds.length === 0) {
      return EMPTY_SET;
    }
    const currentSuspects = new Set(suspectIds.map((id) => id.toLowerCase()));
    const gated = new Set<string>();
    for (const id of confirmed) {
      if (currentSuspects.has(id)) gated.add(id);
    }
    return gated;
  }, [confirmed, suspectIds]);
}
