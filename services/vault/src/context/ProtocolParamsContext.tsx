/**
 * Protocol Params Context
 *
 * Provides protocol parameters from the ProtocolParams contract to all child components.
 * Also provides system-wide data like universal challengers.
 * Fetches params once when the app loads and caches for 5 minutes.
 *
 * This is a BLOCKING provider - children are not rendered until params are loaded.
 * This ensures all deposit-related components have valid minDeposit values.
 */

import { Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import {
  getPegInConfiguration,
  type PegInConfiguration,
} from "@/clients/eth-contract/protocol-params";
import { fetchUniversalChallengers } from "@/services/providers";
import type { UniversalChallenger } from "@/types";

const PROTOCOL_PARAMS_QUERY_KEY = "protocolParams";
const FIVE_MINUTES = 5 * 60 * 1000;

interface ProtocolParamsContextValue {
  /** Peg-in configuration from contract */
  config: PegInConfiguration;
  /** Minimum deposit amount in satoshis (from contract) */
  minDeposit: bigint;
  /** Latest universal challengers (system-wide) - use for new peg-ins */
  latestUniversalChallengers: UniversalChallenger[];
}

const ProtocolParamsContext = createContext<ProtocolParamsContextValue | null>(
  null,
);

interface ProtocolParamsProviderProps {
  children: ReactNode;
}

/**
 * Provider that fetches protocol params on mount and provides them to children.
 * Wrap this around routes that need deposit validation (min amounts).
 *
 * Children are not rendered until params are loaded, ensuring all child
 * components have access to valid values (no undefined minDeposit).
 */
export function ProtocolParamsProvider({
  children,
}: ProtocolParamsProviderProps) {
  // Fetch peg-in configuration from contract
  const {
    data: configData,
    isLoading: configLoading,
    error: configError,
  } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "pegInConfig"],
    queryFn: getPegInConfiguration,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  // Fetch universal challengers (system-wide, rarely change)
  const {
    data: ucData,
    isLoading: ucLoading,
    error: ucError,
  } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "universalChallengers"],
    queryFn: fetchUniversalChallengers,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  const isLoading = configLoading || ucLoading;
  const error = configError || ucError;

  // Show loader while fetching
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  // Show error if fetch failed or data is incomplete
  if (error || !configData || configData.minimumPegInAmount === undefined) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-error">Failed to load protocol parameters</p>
        <p className="text-secondary text-sm">
          {error instanceof Error ? error.message : "Please refresh the page"}
        </p>
      </div>
    );
  }

  const value: ProtocolParamsContextValue = {
    config: configData,
    minDeposit: configData.minimumPegInAmount,
    latestUniversalChallengers: ucData ?? [],
  };

  return (
    <ProtocolParamsContext.Provider value={value}>
      {children}
    </ProtocolParamsContext.Provider>
  );
}

/**
 * Hook to access protocol params from context.
 * Must be used within a ProtocolParamsProvider.
 *
 * Returns guaranteed values (not undefined) since the provider
 * blocks rendering until params are loaded.
 */
export function useProtocolParamsContext(): ProtocolParamsContextValue {
  const ctx = useContext(ProtocolParamsContext);
  if (!ctx) {
    throw new Error(
      "useProtocolParamsContext must be used within a ProtocolParamsProvider",
    );
  }
  return ctx;
}
