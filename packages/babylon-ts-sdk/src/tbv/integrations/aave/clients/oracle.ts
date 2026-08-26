/**
 * Read-only access to `IAaveOracle`. Prices are 8-decimal base units
 * ($80,000 = 8_000_000_000_000n).
 */

import type { Abi, Address, PublicClient } from "viem";

import AaveOracleABI from "./abis/AaveOracle.abi.json";
import AaveSpokeABI from "./abis/AaveSpoke.abi.json";

/** `Spoke.ORACLE` is `immutable`; the result is safe to cache forever. */
export async function getOracleAddress(
  publicClient: PublicClient,
  spokeAddress: Address,
): Promise<Address> {
  const result = await publicClient.readContract({
    address: spokeAddress,
    abi: AaveSpokeABI,
    functionName: "ORACLE",
  });
  return result as Address;
}

/** Batch read; reverts the WHOLE batch on the first bad reserve. */
export async function getReservesPrices(
  publicClient: PublicClient,
  oracleAddress: Address,
  reserveIds: bigint[],
): Promise<bigint[]> {
  const result = await publicClient.readContract({
    address: oracleAddress,
    abi: AaveOracleABI,
    functionName: "getReservesPrices",
    args: [reserveIds],
  });
  return result as bigint[];
}

export interface ReservePriceResult {
  reserveId: bigint;
  /** Raw 1e8 base units, or null on revert. */
  priceRaw: bigint | null;
  error: Error | null;
}

/**
 * Per-reserve isolated read for display lists (one bad source ≠ whole list
 * blank). One multicall round-trip instead of one `eth_call` per reserve:
 * each entry is `getReservesPrices([reserveId])` with `allowFailure: true`, so
 * a single reverting reserve isolates to its own error entry. A network-level
 * multicall failure marks every reserve failed rather than throwing — callers
 * (display hooks) rely on always getting a per-reserve result array.
 */
export async function getReservesPricesSafe(
  publicClient: PublicClient,
  oracleAddress: Address,
  reserveIds: bigint[],
): Promise<ReservePriceResult[]> {
  if (reserveIds.length === 0) return [];

  let results;
  try {
    results = await publicClient.multicall({
      contracts: reserveIds.map((reserveId) => ({
        address: oracleAddress,
        abi: AaveOracleABI as Abi,
        functionName: "getReservesPrices" as const,
        args: [[reserveId]] as const,
      })),
      allowFailure: true,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return reserveIds.map((reserveId) => ({
      reserveId,
      priceRaw: null,
      error,
    }));
  }

  return results.map((result, i): ReservePriceResult => {
    const reserveId = reserveIds[i];
    if (result.status !== "success") {
      const error =
        result.error instanceof Error
          ? result.error
          : new Error(String(result.error ?? "getReservesPrices reverted"));
      return { reserveId, priceRaw: null, error };
    }
    const [priceRaw] = result.result as bigint[];
    return { reserveId, priceRaw, error: null };
  });
}
