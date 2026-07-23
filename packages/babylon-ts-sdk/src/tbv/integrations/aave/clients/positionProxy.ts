/**
 * Aave Adapter Position Proxy Client - Read operations
 *
 * Reads against a depositor's own AaveAdapterPositionProxy instance.
 *
 * NOT the Spoke's same-signature `getReserveTotalDebt` (reserve-wide debt of
 * ALL users): the proxy's returns THIS position's total debt including the
 * adapter's uncollected interest fee — the value the adapter resolves the
 * repay-all sentinel to, and therefore the right quote for sizing a repay-all
 * approval.
 */

import type { Address, PublicClient } from "viem";

import AaveAdapterPositionProxyABI from "./abis/AaveAdapterPositionProxy.abi.json";

/**
 * Fee-inclusive total debt of the position held by `proxyContract` for
 * `reserveId`: Spoke debt plus the adapter's uncollected interest fee
 * (rounded up), computed lazily at the current block.
 */
export async function getPositionReserveTotalDebt(
  publicClient: PublicClient,
  proxyContract: Address,
  reserveId: bigint,
): Promise<bigint> {
  const result = await publicClient.readContract({
    address: proxyContract,
    abi: AaveAdapterPositionProxyABI,
    functionName: "getReserveTotalDebt",
    args: [reserveId],
  });

  // This quote sizes a real approval — assert the shape instead of casting.
  if (typeof result !== "bigint") {
    throw new Error(
      `getReserveTotalDebt returned a non-bigint result for reserve ${reserveId}`,
    );
  }
  return result;
}
