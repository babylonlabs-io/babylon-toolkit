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

import { shouldRetry } from "@/config/queryClient";
import { COPY } from "@/copy";
import { useBorrowReserveLimitOverride } from "@/overrides/borrowReserveLimit";

import { CONFIG_STALE_TIME_MS } from "../constants";
import {
  fetchAaveAppConfig,
  isIntegrityFailure,
  type AaveConfig,
  type AaveReserveConfig,
} from "../services";
import type { BorrowReserveCap } from "../utils/borrowReserveLimit";
import type { HubSpokeConfigs } from "../utils/hubState";

interface AaveConfigContextValue {
  config: AaveConfig | null;
  vbtcReserve: AaveReserveConfig | null;
  borrowableReserves: AaveReserveConfig[];
  /** Includes frozen/paused reserves so users can still repay legacy debt. */
  allBorrowReserves: AaveReserveConfig[];
  /** Our spoke's config on each reserve's hub, keyed by reserve id. */
  hubSpokeConfigs: HubSpokeConfigs;
  /**
   * How many reserves the spoke lets one account borrow at once (`null` limit
   * when it sets no cap), or why it could not be read. Never hardcoded — Aave
   * may raise it. Carries the god-mode cap override, so it drives what the UI
   * shows and offers.
   */
  maxBorrowReserves: BorrowReserveCap;
  /**
   * The Spoke's own cap, before any god-mode override. The pre-sign gate reads
   * this one: it must refuse exactly what the chain would revert, no more and
   * no less.
   */
  chainMaxBorrowReserves: BorrowReserveCap;
  /** Re-runs the config read, e.g. to recover a cap that could not be read. */
  refetchConfig: () => Promise<unknown>;
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
  // Dev / QA only: compile-time null in production builds.
  const maxBorrowReservesOverride = useBorrowReserveLimitOverride();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["aaveAppConfig"],
    queryFn: () => fetchAaveAppConfig(),
    staleTime: CONFIG_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    // A reserve that disagrees with the chain is a conclusion, not a fault:
    // retrying repeats every read only to fail the same way. Every other error
    // keeps the app's default policy.
    retry: (failureCount, error) =>
      !isIntegrityFailure(error) && shouldRetry(failureCount, error),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader size={32} />
      </div>
    );
  }

  // Fail closed: a null config + empty reserves looks like "no position"
  // while an on-chain position may still exist (audit #312). A refetch that
  // merely fails keeps the config it already verified (React Query holds
  // `data`), so a failed Retry does not take down every route; an integrity
  // failure still shuts the app down.
  if (data == null || (error !== null && isIntegrityFailure(error))) {
    if (errorFallback !== undefined) return <>{errorFallback}</>;
    return (
      // `app-error-state` is read by the visual capture
      // (services/vault/e2e/visual/capture.ts), which refuses to photograph
      // an error surface as a baseline. This fallback covers every page that
      // needs Aave config, so it is what a capture with no backend behind it
      // renders - and it is stable, so it diffs clean against itself forever.
      <div
        data-testid="app-error-state"
        className="flex min-h-[400px] flex-col items-center justify-center gap-3 px-4 text-center"
      >
        <p className="text-base font-medium">
          {COPY.common.aaveConfigUnavailable.heading}
        </p>
        <p className="max-w-md text-sm text-accent-secondary">
          {COPY.common.aaveConfigUnavailable.body}
        </p>
        <Button variant="contained" onClick={() => refetch()}>
          {COPY.common.aaveConfigUnavailable.retryButton}
        </Button>
      </div>
    );
  }

  const value: AaveConfigContextValue = {
    config: data.config,
    vbtcReserve: data.vbtcReserve,
    borrowableReserves: data.borrowableReserves,
    allBorrowReserves: data.allBorrowReserves,
    hubSpokeConfigs: data.hubSpokeConfigs,
    // An override forces a cap the chain did read; it never masks a failed
    // read, which must keep blocking the borrow side.
    maxBorrowReserves:
      maxBorrowReservesOverride !== null &&
      data.maxBorrowReserves.status === "loaded"
        ? { status: "loaded", limit: maxBorrowReservesOverride }
        : data.maxBorrowReserves,
    chainMaxBorrowReserves: data.maxBorrowReserves,
    refetchConfig: async () => {
      const result = await refetch();
      if (result.isError) {
        throw result.error;
      }
    },
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
