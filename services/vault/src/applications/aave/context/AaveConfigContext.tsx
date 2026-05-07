/**
 * Aave Config Context
 *
 * Provides Aave protocol configuration data to all child components.
 * Fetches all config in a single GraphQL request when the Aave app loads:
 * - Contract addresses and reserve IDs
 * - vBTC reserve config (for liquidation threshold)
 * - Borrowable reserves list (for asset selection)
 */

import { Button, Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { CONFIG_STALE_TIME_MS } from "../constants";
import {
  fetchAaveAppConfig,
  type AaveConfig,
  type AaveReserveConfig,
} from "../services";

interface AaveConfigContextValue {
  config: AaveConfig | null;
  vbtcReserve: AaveReserveConfig | null;
  borrowableReserves: AaveReserveConfig[];
  /** Includes frozen/paused reserves so users can still repay legacy debt. */
  allBorrowReserves: AaveReserveConfig[];
}

const AaveConfigContext = createContext<AaveConfigContextValue | null>(null);

interface AaveConfigProviderProps {
  children: ReactNode;
  /** Override the default unavailable panel. Pass `null` to suppress. */
  errorFallback?: ReactNode;
}

export function AaveConfigProvider({
  children,
  errorFallback,
}: AaveConfigProviderProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aaveAppConfig"],
    queryFn: () => fetchAaveAppConfig(),
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  // Fail closed: a null config + empty reserves looks like "no position"
  // while an on-chain position may still exist (audit #312).
  if (error || data == null) {
    if (errorFallback !== undefined) return <>{errorFallback}</>;
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-base font-medium">Something went wrong</p>
        <p className="max-w-md text-sm text-accent-secondary">
          Please try again in a moment.
        </p>
        <Button variant="contained" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const value: AaveConfigContextValue = {
    config: data.config,
    vbtcReserve: data.vbtcReserve,
    borrowableReserves: data.borrowableReserves,
    allBorrowReserves: data.allBorrowReserves,
  };

  return (
    <AaveConfigContext.Provider value={value}>
      {children}
    </AaveConfigContext.Provider>
  );
}

export function useAaveConfig(): AaveConfigContextValue {
  const ctx = useContext(AaveConfigContext);
  if (!ctx) {
    throw new Error("useAaveConfig must be used within an AaveConfigProvider");
  }
  return ctx;
}
