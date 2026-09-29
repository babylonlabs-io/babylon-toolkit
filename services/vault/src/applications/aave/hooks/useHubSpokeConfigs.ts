/**
 * Our Core Spoke's config on the given reserves' hubs, read live, for the forms
 * that block an action on a hub's state (borrow, repay, withdraw).
 *
 * The copy read at config load filters the borrowable list, but it is never
 * refreshed while the app stays open, and a cached "halted" must not keep a
 * user from repaying once the hub lifts the halt. Until the first live read
 * lands, the config-load copy stands in for it. After that, a change in the
 * reserve set (the position loading, another reserve selected) keeps the last
 * live result until the new read lands, laid over the config-load copy: a
 * reserve that result covers keeps its live state, and one it does not cover
 * keeps its config-load state rather than reading as usable.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { AAVE_HUB_SPOKE_CONFIGS_QUERY_KEY as QUERY_KEY } from "@/utils/queryKeys";

import { getHubSpokeConfigsSafe } from "../clients/aaveHub";
import { useAaveConfig } from "../context";
import type { AaveReserveConfig } from "../services/fetchConfig";
import type { HubSpokeConfigs } from "../utils/hubState";

const ONE_MINUTE_MS = 60 * 1000;

export function useHubSpokeConfigs(
  reserves: readonly AaveReserveConfig[],
): HubSpokeConfigs {
  const { config, hubSpokeConfigs: configLoadCopy } = useAaveConfig();
  const spoke = config?.coreSpokeAddress;

  const reserveAssetsKey = useMemo(
    () =>
      reserves
        .map(
          (r) =>
            `${r.reserveId.toString()}:${r.reserve.hub.toLowerCase()}:${r.reserve.assetId}`,
        )
        .sort()
        .join(","),
    [reserves],
  );

  const { data, isPlaceholderData } = useQuery({
    queryKey: [QUERY_KEY, spoke?.toLowerCase(), reserveAssetsKey],
    queryFn: async (): Promise<HubSpokeConfigs> => {
      const results = await getHubSpokeConfigsSafe(
        spoke!,
        reserves.map((r) => ({
          hub: r.reserve.hub,
          assetId: r.reserve.assetId,
        })),
      );
      return Object.fromEntries(
        reserves.map((r, i) => [r.reserveId.toString(), results[i]]),
      );
    },
    enabled: reserves.length > 0 && spoke != null,
    staleTime: ONE_MINUTE_MS,
    refetchInterval: ONE_MINUTE_MS,
    placeholderData: keepPreviousData,
  });

  return useMemo(() => {
    if (data === undefined) return configLoadCopy;
    // The previous set's result covers only that set's reserves.
    return isPlaceholderData ? { ...configLoadCopy, ...data } : data;
  }, [data, isPlaceholderData, configLoadCopy]);
}
