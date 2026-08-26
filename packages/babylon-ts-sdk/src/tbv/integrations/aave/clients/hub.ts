/**
 * Read-only access to the Aave v4 Hub (`IHub`). Each spoke reserve points at
 * a Hub asset (`reserve.hub` + `reserve.assetId`); the Hub is where interest
 * accrues, so live borrow rates are read here rather than from the Spoke.
 */

import type { Abi, Address, PublicClient } from "viem";

import AaveHubABI from "./abis/AaveHub.abi.json";

/** Identifies one Hub asset to read the drawn rate for. */
export interface AssetDrawnRateRequest {
  /** Hub contract address (from the reserve's `hub` field). */
  hub: Address;
  /** Asset identifier on that Hub (from the reserve's `assetId` field). */
  assetId: number;
}

export interface AssetDrawnRateResult {
  hub: Address;
  assetId: number;
  /** Annual borrow (drawn) rate in RAY (1e27 = 100%), or null on revert. */
  rateRay: bigint | null;
  error: Error | null;
}

/**
 * Per-asset isolated read of `getAssetDrawnRate` for display lists (one bad
 * asset ≠ whole list blank). One multicall round-trip instead of one
 * `eth_call` per asset, with `allowFailure: true` so a single reverting asset
 * isolates to its own error entry. A network-level multicall failure marks
 * every asset failed rather than throwing — callers (display hooks) rely on
 * always getting a per-asset result array.
 *
 * The returned rate is the linear annual rate in RAY (the Hub accrues
 * interest as `rate * dt / SECONDS_PER_YEAR`), i.e. an APR, not an APY.
 */
export async function getAssetDrawnRatesSafe(
  publicClient: PublicClient,
  requests: AssetDrawnRateRequest[],
): Promise<AssetDrawnRateResult[]> {
  if (requests.length === 0) return [];

  let results;
  try {
    results = await publicClient.multicall({
      contracts: requests.map(({ hub, assetId }) => ({
        address: hub,
        abi: AaveHubABI as Abi,
        functionName: "getAssetDrawnRate" as const,
        args: [BigInt(assetId)] as const,
      })),
      allowFailure: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return requests.map(({ hub, assetId }) => ({
      hub,
      assetId,
      rateRay: null,
      error,
    }));
  }

  return results.map((result, i): AssetDrawnRateResult => {
    const { hub, assetId } = requests[i];
    if (result.status !== "success") {
      const error =
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error ?? "getAssetDrawnRate reverted"));
      return { hub, assetId, rateRay: null, error };
    }
    return { hub, assetId, rateRay: result.result as bigint, error: null };
  });
}
