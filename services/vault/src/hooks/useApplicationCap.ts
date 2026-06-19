/**
 * Hook returning a live snapshot of the configured application BTC cap and
 * current usage (protocol-total and optionally per-user).
 *
 * Reads from the on-chain CapPolicy contract, keyed by the configured Aave
 * adapter entry point. Gated by the `DISABLE_VAULT_CAP` kill-switch — when
 * the flag is set, the hook short-circuits without any RPC reads and
 * consumers see a stable "no feature" state (`snapshot: null`,
 * `isLoading: false`, `error: null`).
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getApplicationCap,
  getApplicationUsage,
} from "@/clients/eth-contract/cap-policy";
import { CONTRACTS } from "@/config/contracts";
import featureFlags from "@/config/featureFlags";
import { computeCapSnapshot, type CapSnapshot } from "@/services/deposit";
import { toCheckedAddress } from "@/utils/addressUtils";

const APPLICATION_CAP_KEY = "applicationCap";
const CAP_REFETCH_INTERVAL_MS = 60_000;
const CAP_STALE_TIME_MS = 30_000;
const CAP_MAX_STALE_AGE_MS = 3 * CAP_REFETCH_INTERVAL_MS;

// Stable sentinel so the public `error` reference does not churn on every
// render while stale — a consumer placing it in a dependency array must not
// see a fresh object each render.
const CAP_STALE_ERROR = new Error("Cap data is stale — RPC may be unavailable");

export interface UseApplicationCapResult {
  snapshot: CapSnapshot | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Flips to `true` once `dataUpdatedAt` is older than `CAP_MAX_STALE_AGE_MS`,
 * driven by a timer rather than render timing so the boundary is crossed even
 * when polling stops producing renders. Resets to `false` only when
 * `dataUpdatedAt` advances (a successful fetch), never merely because a fetch
 * is in flight — keeping the gate fail-closed across refetch attempts.
 */
function useStaleAfterMaxAge(dataUpdatedAt: number, active: boolean): boolean {
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (!active || dataUpdatedAt === 0) {
      setIsStale(false);
      return;
    }
    const remaining = dataUpdatedAt + CAP_MAX_STALE_AGE_MS - Date.now();
    if (remaining <= 0) {
      setIsStale(true);
      return;
    }
    setIsStale(false);
    const timer = setTimeout(() => setIsStale(true), remaining);
    return () => clearTimeout(timer);
  }, [dataUpdatedAt, active]);

  return isStale;
}

export function useApplicationCap(user?: string): UseApplicationCapResult {
  const enabled = !featureFlags.isVaultCapDisabled;
  const app = CONTRACTS.AAVE_ADAPTER;
  const userAddress = enabled ? toCheckedAddress(user) : undefined;

  const capsQuery = useQuery({
    queryKey: [APPLICATION_CAP_KEY, "caps", app],
    queryFn: () => getApplicationCap(app),
    staleTime: CAP_STALE_TIME_MS,
    refetchInterval: CAP_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    // Surface a real error when offline instead of silently pausing refetches
    // and serving cached cap data — the stale timer is the backstop, this is
    // the direct signal. Matches useERC20Balance / useAaveUserPosition.
    networkMode: "always",
    enabled,
  });

  // Usage is fetched whenever caps are known — both capped and uncapped
  // deployments need the live `totalBTC` for the dashboard's
  // SupplyCapSection ("Total Deposited"). The per-user leg of the multicall
  // is only consumed by `remainingForUser` (gated on `hasPerAddressCap`), so
  // when there is no per-address cap we drop the user from the call to skip
  // an unused on-chain read.
  const capsResolved = capsQuery.data !== undefined;
  const userAddressForUsage =
    capsQuery.data !== undefined && capsQuery.data.perAddressCapBTC > 0n
      ? userAddress
      : undefined;

  const usageQuery = useQuery({
    queryKey: [APPLICATION_CAP_KEY, "usage", app, userAddressForUsage ?? null],
    queryFn: () => getApplicationUsage(app, userAddressForUsage),
    staleTime: CAP_STALE_TIME_MS,
    refetchInterval: CAP_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    networkMode: "always",
    enabled: enabled && capsResolved,
  });

  const snapshot = useMemo<CapSnapshot | null>(() => {
    if (!enabled || !capsQuery.data) return null;
    const uncapped =
      capsQuery.data.totalCapBTC === 0n &&
      capsQuery.data.perAddressCapBTC === 0n;
    if (uncapped) {
      // The dashboard's SupplyCapSection still surfaces the live "Total
      // Deposited" value when the protocol is uncapped, so wait for the
      // usage query to settle before resolving. On a usage error fall back
      // to a synthetic 0n so the card stays renderable; the error itself is
      // shielded below to keep the deposit form unblocked.
      const usageSettled =
        usageQuery.data !== undefined || usageQuery.error !== null;
      if (!usageSettled) return null;
      return computeCapSnapshot({
        caps: capsQuery.data,
        totalBTC: usageQuery.data?.totalBTC ?? 0n,
        userBTC: usageQuery.data?.userBTC ?? null,
      });
    }
    if (!usageQuery.data) return null;
    return computeCapSnapshot({
      caps: capsQuery.data,
      totalBTC: usageQuery.data.totalBTC,
      userBTC: usageQuery.data.userBTC,
    });
  }, [enabled, capsQuery.data, usageQuery.data, usageQuery.error]);

  const capsRefetch = capsQuery.refetch;
  const usageRefetch = usageQuery.refetch;
  const refetch = useCallback(() => {
    capsRefetch();
    usageRefetch();
  }, [capsRefetch, usageRefetch]);

  // Once an uncapped snapshot resolves, the usage query's error state must not
  // bleed into the public surface, otherwise an unrelated usage RPC failure
  // would set `capUnavailable: true` in the deposit form and block all
  // deposits with "Unable to verify supply cap". (Pending state, on the other
  // hand, is intentionally surfaced via `isLoading` so the dashboard's
  // SupplyCapSection skeleton waits for usage data before showing the
  // "Total Deposited" card.)
  const uncappedSnapshot =
    snapshot !== null && !snapshot.hasTotalCap && !snapshot.hasPerAddressCap;

  // Timer-driven so the staleness boundary trips even when polling stops
  // producing renders. Usage staleness is suppressed on the uncapped path for
  // the same reason its error is shielded below — it must not block deposits.
  const capsStale = useStaleAfterMaxAge(capsQuery.dataUpdatedAt, enabled);
  const usageStale = useStaleAfterMaxAge(usageQuery.dataUpdatedAt, enabled);
  const staleError =
    capsStale || (usageStale && !uncappedSnapshot) ? CAP_STALE_ERROR : null;

  const baseError = (
    uncappedSnapshot ? capsQuery.error : (capsQuery.error ?? usageQuery.error)
  ) as Error | null;

  return {
    snapshot,
    isLoading: uncappedSnapshot
      ? capsQuery.isLoading
      : capsQuery.isLoading || usageQuery.isLoading,
    error: staleError ?? baseError,
    refetch,
  };
}
