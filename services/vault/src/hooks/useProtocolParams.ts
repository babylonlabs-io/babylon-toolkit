/**
 * Protocol Parameters Hook
 *
 * Provides access to full protocol parameters from the ProtocolParams contract.
 * Parameters are cached for 5 minutes since they rarely change.
 *
 * NOTE: For deposit validation (minDeposit), prefer `useProtocolParamsContext()`
 * which blocks rendering until params are loaded.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getTBVProtocolParams,
  type TBVProtocolParams,
} from "@/clients/eth-contract/protocol-params";

const PROTOCOL_PARAMS_QUERY_KEY = "protocolParams";
const FIVE_MINUTES = 5 * 60 * 1000;

export interface UseProtocolParamsResult {
  /** Full protocol parameters */
  params: TBVProtocolParams | undefined;
  /** Whether params are currently being fetched */
  isLoading: boolean;
  /** Error if the fetch failed */
  error: Error | null;
  /** Refetch the params */
  refetch: () => void;
}

/**
 * Hook to fetch all protocol parameters from the ProtocolParams contract.
 *
 * This is a non-blocking hook that returns undefined while loading.
 * For deposit flows, use `useProtocolParamsContext()` instead.
 */
export function useProtocolParams(): UseProtocolParamsResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "full"],
    queryFn: getTBVProtocolParams,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    params: data,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
