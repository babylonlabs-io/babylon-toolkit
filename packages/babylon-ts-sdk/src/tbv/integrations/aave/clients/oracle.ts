/**
 * Read-only access to `IAaveOracle`. Prices are 8-decimal base units
 * ($80,000 = 8_000_000_000_000n).
 */

import type { Address, PublicClient } from "viem";

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

/** Per-reserve isolated read for display lists (one bad source ≠ whole list blank). */
export async function getReservesPricesSafe(
  publicClient: PublicClient,
  oracleAddress: Address,
  reserveIds: bigint[],
): Promise<ReservePriceResult[]> {
  return Promise.all(
    reserveIds.map(
      async (reserveId): Promise<ReservePriceResult> => {
        try {
          const [priceRaw] = await getReservesPrices(
            publicClient,
            oracleAddress,
            [reserveId],
          );
          return { reserveId, priceRaw, error: null };
        } catch (err) {
          return {
            reserveId,
            priceRaw: null,
            error: err instanceof Error ? err : new Error(String(err)),
          };
        }
      },
    ),
  );
}
