/**
 * Reads `Spoke.ORACLE()` once per spoke. The on-chain field is `immutable`, so
 * a successful read is cached forever.
 *
 * A failed read rides in the query data, as in `useInterestRateModelCurve`:
 * the queryFn always resolves. A thrown query error would be reset to loading
 * on every retry of a query with no data, would belong to no cache entry once
 * a consumer remounts, and would be reported to error tracking on every
 * settled failure (see `config/queryClient.ts`). Here the error stays with the
 * spoke's own entry, and the queryFn reports it once, on the ok -> error edge.
 * A queryFn that never rejects gets no retries from React Query, so it retries
 * a fresh failure on the app's policy itself before it records it: a single
 * failed RPC call never reaches a consumer.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";

import { withQueryRetryPolicy } from "@/config/queryClient";
import { logger } from "@/infrastructure";
import { normalizeError } from "@/utils/errors/normalizeError";

import { getOracleAddress } from "../clients/aaveOracle";
import { ORACLE_READ_RETRY_INTERVAL_MS } from "../constants";

const QUERY_KEY = "aaveOracleAddress";

interface OracleAddressQueryData {
  oracleAddress: Address | null;
  error: Error | null;
}

export interface UseAaveOracleAddressResult {
  oracleAddress: Address | null;
  /** First read only: a failed read stays failed, not loading, while retried. */
  isLoading: boolean;
  error: Error | null;
}

export function useAaveOracleAddress({
  spokeAddress,
}: {
  spokeAddress: Address | undefined;
}): UseAaveOracleAddressResult {
  const queryClient = useQueryClient();
  const enabled = spokeAddress != null;
  const queryKey = [QUERY_KEY, spokeAddress];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async ({ signal }): Promise<OracleAddressQueryData> => {
      const prev = queryClient.getQueryData<OracleAddressQueryData>(queryKey);
      const read = () => getOracleAddress(spokeAddress!);
      try {
        // Once a failure is recorded, the error refetch is the retry: one
        // read, not another round of backoff on the shared RPC client.
        return {
          oracleAddress: await (prev?.error
            ? read()
            : withQueryRetryPolicy(read, signal)),
          error: null,
        };
      } catch (err) {
        // A cancelled fetch is React Query discarding this attempt, not a
        // failed read.
        if (signal.aborted) throw err;
        const error = normalizeError(err);
        if (prev === undefined || prev.error === null) {
          logger.error(error, {
            tags: { query: QUERY_KEY },
            data: { spokeAddress: spokeAddress! },
          });
        }
        return { oracleAddress: null, error };
      }
    },
    enabled,
    staleTime: (query) => (query.state.data?.error ? 0 : Infinity),
    gcTime: Infinity,
    // The error refetch is the retry; without it a failed read is never read
    // again until another component mounts the query.
    refetchInterval: (query) =>
      query.state.data?.error ? ORACLE_READ_RETRY_INTERVAL_MS : false,
    // The queryFn makes the quick retries itself and never rejects.
    retry: false,
  });
  return {
    oracleAddress: data?.oracleAddress ?? null,
    isLoading: enabled ? isLoading : false,
    error: data?.error ?? null,
  };
}
