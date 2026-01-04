/**
 * Aave Config Context
 *
 * Provides Aave protocol configuration data to all child components.
 * Fetches all config in a single GraphQL request when the Aave app loads:
 * - Contract addresses and reserve IDs
 * - vBTC reserve config (for liquidation threshold)
 * - Borrowable reserves list (for asset selection)
 */

import { Loader } from "@babylonlabs-io/core-ui";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { CONFIG_STALE_TIME_MS } from "../constants";
import {
  fetchAaveAppConfig,
  type AaveConfig,
  type AaveReserveConfig,
} from "../services";

interface AaveConfigContextValue {
  /** Aave contract addresses and reserve IDs */
  config: AaveConfig | null;
  /** vBTC reserve configuration (collateral reserve) */
  vbtcReserve: AaveReserveConfig | null;
  /** List of reserves that can be borrowed */
  borrowableReserves: AaveReserveConfig[];
  /** Whether config is still loading */
  isLoading: boolean;
  /** Error if config fetch failed */
  error: Error | null;
}

const AaveConfigContext = createContext<AaveConfigContextValue | null>(null);

interface AaveConfigProviderProps {
  children: ReactNode;
}

/**
 * Provider that fetches Aave config on mount and provides it to children.
 * Wrap this around the Aave routes to ensure config is available.
 *
 * Children are not rendered until config is loaded, ensuring all child
 * components have access to valid config values (no undefined spokeAddress, etc.)
 */
export function AaveConfigProvider({ children }: AaveConfigProviderProps) {
  // Fetch all Aave config in a single GraphQL request
  const { data, isLoading, error } = useQuery({
    queryKey: ["aaveAppConfig"],
    queryFn: () => fetchAaveAppConfig(),
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  // Don't render children until config is loaded.
  // This ensures all child components have valid config values.
  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  const value: AaveConfigContextValue = {
    config: data?.config ?? null,
    vbtcReserve: data?.vbtcReserve ?? null,
    borrowableReserves: data?.borrowableReserves ?? [],
    isLoading: false,
    error: error as Error | null,
  };

  return (
    <AaveConfigContext.Provider value={value}>
      {children}
    </AaveConfigContext.Provider>
  );
}

/**
 * Hook to access Aave config from context.
 * Must be used within an AaveConfigProvider.
 */
export function useAaveConfig(): AaveConfigContextValue {
  const ctx = useContext(AaveConfigContext);
  if (!ctx) {
    throw new Error("useAaveConfig must be used within an AaveConfigProvider");
  }
  return ctx;
}
