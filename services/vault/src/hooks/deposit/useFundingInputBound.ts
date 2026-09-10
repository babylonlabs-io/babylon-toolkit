/**
 * On-chain `ProtocolParams.maxFundingInputCount` — the most Bitcoin UTXOs one
 * Pre-PegIn may spend. Read on its own React Query key rather than folded into
 * the peg-in configuration multicall: `useDepositFlow` overwrites this entry
 * from every pinned build read, and sharing a key would make that overwrite
 * rewrite a configuration snapshot the blocking provider also reads.
 *
 * @module hooks/deposit/useFundingInputBound
 */

import type { FundingInputBound } from "@babylonlabs-io/ts-sdk/tbv/core";
import { useQuery } from "@tanstack/react-query";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";

const STALE_TIME_MS = 5 * 60 * 1000;
const RETRY_COUNT = 3;
const BLOCKED_REFETCH_INTERVAL_MS = 60 * 1000;

export const FUNDING_INPUT_BOUND_QUERY_KEY = [
  "protocolParams",
  "fundingInputBound",
] as const;

export interface UseFundingInputBoundResult {
  /** The chain's bound, or undefined while the read is in flight. */
  bound: FundingInputBound | undefined;
  /** True when the read terminally failed — consumers must fail closed. */
  isError: boolean;
}

export function useFundingInputBound(): UseFundingInputBoundResult {
  const { data, isError } = useQuery({
    queryKey: FUNDING_INPUT_BOUND_QUERY_KEY,
    queryFn: async (): Promise<FundingInputBound> => {
      const reader = await getProtocolParamsReader();
      return reader.getMaxFundingInputCount();
    },
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
    retry: RETRY_COUNT,
    // A failed read (including a failed refetch that kept older data) and an
    // unpublished bound both block the deposit CTA and both can be lifted by
    // the chain, so they must keep polling or a mounted page stays blocked
    // forever. `unsupported` and `published` are terminal and must not poll.
    refetchInterval: (query) =>
      query.state.status === "error" ||
      query.state.data?.status === "unpublished"
        ? BLOCKED_REFETCH_INTERVAL_MS
        : false,
  });

  return { bound: data, isError };
}

/**
 * The bound as the UTXO selector wants it: a positive integer, or `null` for a
 * deployment that predates the field. `unpublished` deliberately resolves to
 * `undefined`, not `null` — the form blocks that state on its own, and handing
 * the estimator `null` would fail open by selecting without any cap.
 */
export function resolveMaxInputCount(
  bound: FundingInputBound | undefined,
): number | null | undefined {
  if (bound === undefined) return undefined;
  if (bound.status === "unsupported") return null;
  if (bound.status === "published") return bound.maxInputs;
  return undefined;
}
