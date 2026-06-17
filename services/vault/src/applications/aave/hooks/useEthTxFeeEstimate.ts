/**
 * Generic Ethereum transaction fee estimator.
 *
 * Given a thunk that prepares the unsigned call (`{ to, data }`) — or `null`
 * when the call can't be estimated yet (e.g. a repay before token approval) —
 * runs `eth_estimateGas` against the env-pinned read client, multiplies by the
 * current gas price, and formats the result as an ETH (and, when an ETH/USD
 * price is available, USD) string.
 *
 * Returns `display: null` whenever a real estimate isn't available — a reverted
 * simulation or a `prepare` that returns `null` — so callers fall back to
 * `COPY.common.emptyValue`, plus `isLoading` so they can show a loader while a
 * fetch is in flight. Mirrors `useReorderGasEstimate`.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address, Hex } from "viem";

import { ethClient } from "@/clients/eth-contract/client";
import { usePrice } from "@/hooks/usePrices";

import { formatNetworkFee, weiToEth } from "../utils/networkFee";

/** How long an estimate stays fresh before React Query refetches it. */
const FEE_STALE_TIME_MS = 30_000;

/**
 * Quiet period before an amount-driven estimate runs. Long enough that a
 * continuous slider drag settles to one estimate instead of one RPC round-trip
 * per tick; short enough to feel responsive once the user stops.
 */
export const FEE_ESTIMATE_DEBOUNCE_MS = 400;

/** An unsigned call to estimate gas for. */
export interface EthTxCall {
  to: Address;
  data: Hex;
}

export interface EthTxFee {
  /**
   * Display string like `"0.000123 ETH ($0.25 USD)"`, or null whenever a real
   * estimate isn't available — a reverted simulation or a `prepare` that
   * returned null. Callers fall back to `COPY.common.emptyValue`.
   */
  display: string | null;
  /** True while the estimate is in flight, so callers can show a loader. */
  isLoading: boolean;
}

export function useEthTxFeeEstimate({
  prepare,
  account,
  enabled,
  queryKey,
}: {
  /** Builds the call to estimate, or null when not estimable yet. */
  prepare: () => Promise<EthTxCall | null> | EthTxCall | null;
  account: Address | undefined;
  enabled: boolean;
  /** Caller-supplied key parts that uniquely identify this estimate. */
  queryKey: ReadonlyArray<unknown>;
}): EthTxFee {
  const ethPrice = usePrice("ETH");

  const { data, isError, isLoading } = useQuery({
    queryKey: ["ethTxFeeEstimate", ...queryKey],
    queryFn: async () => {
      const call = await prepare();
      if (!call) return null;

      const publicClient = ethClient.getPublicClient();
      const [gasUnits, gasPrice] = await Promise.all([
        publicClient.estimateGas({ to: call.to, data: call.data, account }),
        publicClient.getGasPrice(),
      ]);
      return weiToEth(gasUnits * gasPrice);
    },
    enabled: enabled && !!account,
    staleTime: FEE_STALE_TIME_MS,
    retry: 1,
  });

  return useMemo(() => {
    // `data == null` covers both an in-flight estimate (undefined) and a
    // resolved "unavailable" (null from `prepare`); `isLoading` distinguishes
    // them so callers show a loader only while a fetch is actually running.
    if (isError || data == null) return { display: null, isLoading };
    return { display: formatNetworkFee(data, ethPrice), isLoading: false };
  }, [isError, data, isLoading, ethPrice]);
}
