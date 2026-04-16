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
import { useCallback, useMemo } from "react";
import type { Address } from "viem";

import {
  getApplicationCap,
  getApplicationUsage,
} from "@/clients/eth-contract/cap-policy";
import { CONTRACTS } from "@/config/contracts";
import featureFlags from "@/config/featureFlags";
import { computeCapSnapshot, type CapSnapshot } from "@/services/deposit";

const APPLICATION_CAP_KEY = "applicationCap";
const CAP_REFETCH_INTERVAL_MS = 60_000;
const CAP_STALE_TIME_MS = 30_000;

export interface UseApplicationCapResult {
  snapshot: CapSnapshot | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useApplicationCap(user?: string): UseApplicationCapResult {
  const enabled = !featureFlags.isVaultCapDisabled;
  const app = CONTRACTS.AAVE_ADAPTER;
  // Wallet adapters surface addresses as string; cast at the boundary.
  const userAddress = user ? (user as Address) : undefined;

  const capsQuery = useQuery({
    queryKey: [APPLICATION_CAP_KEY, "caps", app],
    queryFn: () => getApplicationCap(app),
    staleTime: CAP_STALE_TIME_MS,
    refetchInterval: CAP_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    enabled,
  });

  const usageQuery = useQuery({
    queryKey: [APPLICATION_CAP_KEY, "usage", app, userAddress ?? null],
    queryFn: () => getApplicationUsage(app, userAddress),
    staleTime: CAP_STALE_TIME_MS,
    refetchInterval: CAP_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: false,
    enabled,
  });

  const snapshot = useMemo<CapSnapshot | null>(() => {
    if (!enabled || !capsQuery.data) return null;
    // Uncapped deployments resolve immediately once caps are known; usage data
    // is irrelevant when no cap exists, so the UI can hide without waiting on
    // the usage query to finish loading.
    const uncapped =
      capsQuery.data.totalCapBTC === 0n &&
      capsQuery.data.perAddressCapBTC === 0n;
    if (uncapped) {
      return computeCapSnapshot({
        caps: capsQuery.data,
        totalBTC: 0n,
        userBTC: null,
      });
    }
    if (!usageQuery.data) return null;
    return computeCapSnapshot({
      caps: capsQuery.data,
      totalBTC: usageQuery.data.totalBTC,
      userBTC: usageQuery.data.userBTC,
    });
  }, [enabled, capsQuery.data, usageQuery.data]);

  const capsRefetch = capsQuery.refetch;
  const usageRefetch = usageQuery.refetch;
  const refetch = useCallback(() => {
    capsRefetch();
    usageRefetch();
  }, [capsRefetch, usageRefetch]);

  // Once an uncapped snapshot resolves, the usage query is irrelevant — its
  // pending/error state must not bleed into the public surface, otherwise an
  // unrelated usage RPC failure would set `capUnavailable: true` in the
  // deposit form and block all deposits with "Unable to verify supply cap".
  const uncappedSnapshot =
    snapshot !== null && !snapshot.hasTotalCap && !snapshot.hasPerAddressCap;

  return {
    snapshot,
    isLoading: uncappedSnapshot
      ? capsQuery.isLoading
      : capsQuery.isLoading || usageQuery.isLoading,
    error: (uncappedSnapshot
      ? capsQuery.error
      : (capsQuery.error ?? usageQuery.error)) as Error | null,
    refetch,
  };
}
