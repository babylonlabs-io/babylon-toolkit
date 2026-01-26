/**
 * Protocol Params Context
 *
 * Provides protocol parameters from the ProtocolParams contract to all child components.
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

const PROTOCOL_PARAMS_QUERY_KEY = "protocolParams";
const FIVE_MINUTES = 5 * 60 * 1000;

interface ProtocolParamsContextValue {
  /** Peg-in configuration from contract */
  config: PegInConfiguration;
  /** Minimum deposit amount in satoshis (from contract) */
  minDeposit: bigint;
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
  const { data, isLoading, error } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "pegInConfig"],
    queryFn: getPegInConfiguration,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  // Show loader while fetching
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  // Show error if fetch failed or data is incomplete
  if (error || !data || data.minimumPegInAmount === undefined) {
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
    config: data,
    minDeposit: data.minimumPegInAmount,
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
