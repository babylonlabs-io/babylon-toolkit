/**
 * Protocol Params Context
 *
 * Provides protocol parameters from the ProtocolParams contract to all child components.
 * Also provides system-wide data like universal challengers (all versions).
 * Fetches params once when the app loads and caches for 5 minutes.
 *
 * This is a BLOCKING provider - children are not rendered until params are loaded.
 * This ensures all deposit-related components have valid minDeposit values.
 */

import { Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

import {
  getPegInConfiguration,
  type PegInConfiguration,
} from "@/clients/eth-contract/protocol-params";
import { fetchAllUniversalChallengers } from "@/services/providers";
import type { UniversalChallenger } from "@/types";

const PROTOCOL_PARAMS_QUERY_KEY = "protocolParams";
const FIVE_MINUTES = 5 * 60 * 1000;

interface ProtocolParamsContextValue {
  /** Peg-in configuration from contract */
  config: PegInConfiguration;
  /** Minimum deposit amount in satoshis (from contract) */
  minDeposit: bigint;
  /** Maximum deposit amount in satoshis (from contract) */
  maxDeposit: bigint;
  /** CSV timelock in blocks for the PegIn output (from offchain params) */
  timelockPegin: number;
  /** Value in satoshis for the depositor's claim output (from offchain params) */
  depositorClaimValue: bigint;
  /** Latest universal challengers - use for new peg-ins */
  latestUniversalChallengers: UniversalChallenger[];
  /** Get universal challengers by version - use for payout signing existing vaults */
  getUniversalChallengersByVersion: (version: number) => UniversalChallenger[];
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

  const {
    data: ucData,
    isLoading: ucLoading,
    error: ucError,
  } = useQuery({
    queryKey: [PROTOCOL_PARAMS_QUERY_KEY, "universalChallengers"],
    queryFn: fetchAllUniversalChallengers,
    staleTime: FIVE_MINUTES,
    refetchOnWindowFocus: false,
    retry: 3,
  });

  const isLoading = configLoading || ucLoading;
  const error = configError || ucError;

  const latestUniversalChallengers = useMemo(() => {
    if (!ucData) return [];
    return ucData.byVersion.get(ucData.latestVersion) ?? [];
  }, [ucData]);

  const getUniversalChallengersByVersion = useCallback(
    (version: number): UniversalChallenger[] => {
      if (!ucData) return [];
      return ucData.byVersion.get(version) ?? [];
    },
    [ucData],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

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
    maxDeposit: configData.maxPegInAmount,
    timelockPegin: configData.timelockPegin,
    depositorClaimValue: configData.depositorClaimValue,
    latestUniversalChallengers,
    getUniversalChallengersByVersion,
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
