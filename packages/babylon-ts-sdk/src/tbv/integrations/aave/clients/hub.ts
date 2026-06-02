/**
 * Read-only access to the Aave V4 Hub's per-asset variable borrow rate
 * (`getAssetDrawnRate`). The returned rate is RAY-scaled (1e27) and annualized
 * (simple APR). Use this getter rather than the stored `Asset.drawnRate` field,
 * which can be stale; `getAssetDrawnRate` recomputes from current utilization.
 */

import type { Abi, Address, PublicClient } from "viem";

import AaveHubABI from "./abis/AaveHub.abi.json";

/** A reserve's location: each reserve may live on a different Hub. */
export interface ReserveHubAsset {
  reserveId: bigint;
  hub: Address;
  /** Hub-side asset id (`uint16` on-chain, widened to bigint for the call). */
  assetId: bigint;
}

export interface ReserveDrawnRate {
  reserveId: bigint;
  /** RAY-scaled (1e27) annual borrow rate, or null on revert. */
  rateRay: bigint | null;
  error: Error | null;
}

/**
 * Per-reserve isolated read of the current variable borrow rate for display
 * lists (one bad reserve ≠ whole list blank). One multicall round-trip with
 * `allowFailure: true`, so a single reverting reserve isolates to its own error
 * entry. A network-level multicall failure marks every reserve failed rather
 * than throwing — callers (display hooks) rely on always getting a per-reserve
 * result array. Each entry targets its own `hub` address.
 */
export async function getReservesDrawnRatesSafe(
  publicClient: PublicClient,
  reserves: ReserveHubAsset[],
): Promise<ReserveDrawnRate[]> {
  if (reserves.length === 0) return [];

  let results;
  try {
    results = await publicClient.multicall({
      contracts: reserves.map((r) => ({
        address: r.hub,
        abi: AaveHubABI as Abi,
        functionName: "getAssetDrawnRate" as const,
        args: [r.assetId] as const,
      })),
      allowFailure: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return reserves.map((r) => ({
      reserveId: r.reserveId,
      rateRay: null,
      error,
    }));
  }

  return results.map((result, i): ReserveDrawnRate => {
    const { reserveId } = reserves[i];
    if (result.status !== "success") {
      const error =
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error ?? "getAssetDrawnRate reverted"));
      return { reserveId, rateRay: null, error };
    }
    return { reserveId, rateRay: result.result as bigint, error: null };
  });
}
