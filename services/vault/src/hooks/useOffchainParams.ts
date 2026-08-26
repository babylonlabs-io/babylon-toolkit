/**
 * Non-blocking access to the protocol's offchain params (all versions).
 *
 * Mirrors the `allOffchainParams` query in ProtocolParamsContext and shares its
 * React Query cache via the same query key, but does NOT block its consumer on
 * load/error. Use this where the UI must stay visible even when protocol-param
 * queries are slow or failing — e.g. the pending-withdraw section, where only
 * the challenge-period ETA needs `timelockAssert` and the rest of the
 * withdrawal status must never be hidden.
 */

import type { AllOffchainParamsData } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";

const OFFCHAIN_PARAMS_STALE_TIME_MS = 5 * 60 * 1000;
const OFFCHAIN_PARAMS_RETRY_COUNT = 3;

// Same key the blocking ProtocolParamsProvider uses, so both share one fetch.
export const OFFCHAIN_PARAMS_QUERY_KEY = [
  "protocolParams",
  "allOffchainParams",
] as const;

/**
 * React Query options for the all-offchain-params fetch. Single source of truth
 * shared by ProtocolParamsContext and {@link useOffchainParams}.
 */
export function offchainParamsQueryOptions() {
  return {
    queryKey: OFFCHAIN_PARAMS_QUERY_KEY,
    queryFn: async (): Promise<AllOffchainParamsData> => {
      const reader = await getProtocolParamsReader();
      return reader.fetchAllOffchainParams((version, error) => {
        logger.warn(
          `Offchain params v${version} failed validation, skipping: ${error.message}`,
          { category: "protocol-params" },
        );
      });
    },
    staleTime: OFFCHAIN_PARAMS_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: OFFCHAIN_PARAMS_RETRY_COUNT,
  };
}

/**
 * Resolve a vault's `timelockAssert` (BTC blocks) for the payout-eligibility
 * countdown.
 *
 * - data not loaded yet → `undefined` (caller shows "Checking…" — transient).
 * - version present → that version's `timelockAssert`.
 * - version missing but data loaded → conservative fallback to the latest known
 *   version's `timelockAssert`, so an unresolvable historical version doesn't
 *   leave the ETA stuck on "Checking…" forever. Mirrors WithdrawFlow's fallback
 *   to `config.offchainParams.timelockAssert`.
 */
export function resolveTimelockAssertBlocks(
  data: AllOffchainParamsData | undefined,
  version: number,
): number | undefined {
  if (!data) return undefined;
  const exact = data.byVersion.get(version)?.timelockAssert;
  if (exact !== undefined) return Number(exact);
  const latest = data.byVersion.get(data.latestVersion)?.timelockAssert;
  return latest !== undefined ? Number(latest) : undefined;
}

interface UseOffchainParamsResult {
  /** Resolve a vault version's `timelockAssert` in BTC blocks (see
   *  {@link resolveTimelockAssertBlocks}). `undefined` while still loading. */
  resolveTimelockAssertBlocks: (version: number) => number | undefined;
}

export function useOffchainParams(): UseOffchainParamsResult {
  const { data } = useQuery(offchainParamsQueryOptions());

  const resolve = useCallback(
    (version: number) => resolveTimelockAssertBlocks(data, version),
    [data],
  );

  return { resolveTimelockAssertBlocks: resolve };
}
