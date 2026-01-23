/**
 * Protocol Parameters Hook
 *
 * Provides access to protocol parameters from the ProtocolParams contract.
 * Parameters are cached for 5 minutes since they rarely change.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getPegInConfiguration,
  getTBVProtocolParams,
  type PegInConfiguration,
  type TBVProtocolParams,
} from "@/clients/eth-contract/protocol-params";
import { DEFAULT_MIN_DEPOSIT_SATS } from "@/services/deposit/constants";

const PROTOCOL_PARAMS_QUERY_KEY = "protocolParams";
const FIVE_MINUTES = 5 * 60 * 1000;

// Re-export business constants for convenience
export { MAX_DEPOSIT_SATS } from "@/services/deposit/constants";

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

export interface UsePegInConfigResult {
  /** Peg-in configuration parameters */
  config: PegInConfiguration | undefined;
  /** Minimum deposit amount in satoshis */
  minDeposit: bigint;
  /** Whether config is currently being fetched */
  isLoading: boolean;
  /** Error if the fetch failed */
  error: Error | null;
  /** Refetch the config */
  refetch: () => void;
}

/**
 * Hook to fetch all protocol parameters from the ProtocolParams contract
 *
 * Parameters are cached for 5 minutes since they rarely change.
 *
 * @returns Object containing protocol params, loading state, and error
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

/**
 * Hook to fetch peg-in configuration from the ProtocolParams contract
 *
 * This is a convenience hook that provides just the peg-in related parameters,
 * useful for deposit validation.
 *
 * @returns Object containing peg-in config, min deposit, loading state, and error
 */
export function usePegInConfig(): UsePegInConfigResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "pegInConfig"],
    queryFn: getPegInConfiguration,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    config: data,
    // Provide default during loading to prevent blocking UI
    minDeposit: data?.minimumPegInAmount ?? DEFAULT_MIN_DEPOSIT_SATS,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to get just the minimum deposit amount
 *
 * @returns Minimum deposit amount in satoshis
 */
export function useMinDeposit(): bigint {
  const { minDeposit } = usePegInConfig();
  return minDeposit;
}
