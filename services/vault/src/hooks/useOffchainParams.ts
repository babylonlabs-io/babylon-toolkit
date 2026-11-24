/**
 * React Query options for the protocol's offchain params (all versions),
 * shared by every consumer so they reuse one cached fetch.
 */

import type { AllOffchainParamsData } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { getProtocolParamsReader } from "@/clients/eth-contract/sdk-readers";
import { logger } from "@/infrastructure";

const OFFCHAIN_PARAMS_STALE_TIME_MS = 5 * 60 * 1000;
const OFFCHAIN_PARAMS_RETRY_COUNT = 3;

const OFFCHAIN_PARAMS_QUERY_KEY = [
  "protocolParams",
  "allOffchainParams",
] as const;

/**
 * React Query options for the all-offchain-params fetch. Single source of truth
 * shared by ProtocolParamsContext and usePeginPollingProtocolParams.
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
