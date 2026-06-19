/** Vault-side access to the Aave v4 Hub reads. */

import {
  getAssetDrawnRatesSafe as sdkGetAssetDrawnRatesSafe,
  type AssetDrawnRateRequest,
  type AssetDrawnRateResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Abi, Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

export async function getAssetDrawnRatesSafe(
  requests: AssetDrawnRateRequest[],
): Promise<AssetDrawnRateResult[]> {
  return sdkGetAssetDrawnRatesSafe(ethClient.getPublicClient(), requests);
}

export type { AssetDrawnRateRequest, AssetDrawnRateResult };

/**
 * Minimal Hub ABI for the two reserve-total reads. The SDK's `AaveHub.abi.json`
 * is the rate-read subset (`getAssetDrawnRate` only), so — matching the
 * cap-policy reader's self-contained-fragment pattern — the liquidity reads are
 * kept app-side rather than widening the shared SDK ABI for one display surface.
 */
const HUB_LIQUIDITY_ABI = [
  {
    type: "function",
    name: "getAssetLiquidity",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getAssetTotalOwed",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Identifies one Hub asset to read reserve totals for. */
export interface AssetLiquidityRequest {
  /** Hub contract address (from the reserve's `hub` field). */
  hub: Address;
  /** Asset identifier on that Hub (from the reserve's `assetId` field). */
  assetId: number;
}

export interface AssetLiquidityResult {
  hub: Address;
  assetId: number;
  /** Borrowable liquidity remaining (token units), or null on revert. */
  availableLiquidityRaw: bigint | null;
  /** Total borrowed: drawn + premium (token units), or null on revert. */
  totalOwedRaw: bigint | null;
  error: Error | null;
}

/**
 * Per-asset isolated read of available liquidity and total owed for display
 * lists (one bad asset ≠ whole list blank). One multicall round-trip pairs
 * `getAssetLiquidity` + `getAssetTotalOwed` per asset with `allowFailure: true`.
 * Both legs are required to derive available liquidity and utilization, so if
 * either reverts the asset is nulled whole (no half-read figure). A
 * network-level multicall failure marks every asset failed rather than throwing
 * — callers (display hooks) rely on always getting a per-asset result array.
 */
export async function getAssetLiquiditiesSafe(
  requests: AssetLiquidityRequest[],
): Promise<AssetLiquidityResult[]> {
  if (requests.length === 0) return [];

  const publicClient = ethClient.getPublicClient();

  let results;
  try {
    results = await publicClient.multicall({
      contracts: requests.flatMap(({ hub, assetId }) => [
        {
          address: hub,
          abi: HUB_LIQUIDITY_ABI as Abi,
          functionName: "getAssetLiquidity" as const,
          args: [BigInt(assetId)] as const,
        },
        {
          address: hub,
          abi: HUB_LIQUIDITY_ABI as Abi,
          functionName: "getAssetTotalOwed" as const,
          args: [BigInt(assetId)] as const,
        },
      ]),
      allowFailure: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return requests.map(({ hub, assetId }) => ({
      hub,
      assetId,
      availableLiquidityRaw: null,
      totalOwedRaw: null,
      error,
    }));
  }

  return requests.map(({ hub, assetId }, i): AssetLiquidityResult => {
    const liquidity = results[i * 2];
    const owed = results[i * 2 + 1];
    if (liquidity.status !== "success" || owed.status !== "success") {
      const failed =
        liquidity.status !== "success" ? liquidity.error : owed.error;
      const error =
        failed instanceof Error
          ? failed
          : new Error(String(failed ?? "Hub reserve-total read reverted"));
      return {
        hub,
        assetId,
        availableLiquidityRaw: null,
        totalOwedRaw: null,
        error,
      };
    }
    return {
      hub,
      assetId,
      availableLiquidityRaw: liquidity.result as bigint,
      totalOwedRaw: owed.result as bigint,
      error: null,
    };
  });
}
