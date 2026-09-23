/**
 * Aave Spoke Client - Read operations
 *
 * Vault-side wrapper that injects ethClient into SDK functions.
 * Used to fetch live user position data (debt, collateral) from the Core Spoke.
 */

import {
  getDynamicReserveConfig as sdkGetDynamicReserveConfig,
  getLiquidationBonusConfig as sdkGetLiquidationBonusConfig,
  getMaxUserReservesLimit as sdkGetMaxUserReservesLimit,
  getReserve as sdkGetReserve,
  getReserves as sdkGetReserves,
  getUserPositionAndAccountData as sdkGetUserPositionAndAccountData,
  getUserPositions as sdkGetUserPositions,
  getUserTotalDebts as sdkGetUserTotalDebts,
  type AaveSpokeUserAccountData,
  type AaveSpokeUserPosition,
  type LiquidationBonusConfig,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

/**
 * Read a user's vBTC-collateral position and aggregate account data in one
 * hard-fail multicall. Thin DI wrapper over the SDK
 * `getUserPositionAndAccountData`; both reads are required for the live view.
 */
export async function getUserPositionWithAccountData(
  spokeAddress: Address,
  reserveId: bigint,
  userAddress: Address,
): Promise<{
  position: AaveSpokeUserPosition;
  accountData: AaveSpokeUserAccountData;
}> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetUserPositionAndAccountData(
    publicClient,
    spokeAddress,
    reserveId,
    userAddress,
  );
}

/**
 * Probe `getUserPosition` for many reserves in one multicall (per-reserve
 * soft-fail). Thin DI wrapper over the SDK `getUserPositions`.
 */
export async function getUserPositionsBatch(
  spokeAddress: Address,
  reserveIds: bigint[],
  userAddress: Address,
): Promise<(AaveSpokeUserPosition | null)[]> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetUserPositions(
    publicClient,
    spokeAddress,
    reserveIds,
    userAddress,
  );
}

/**
 * Read `getUserTotalDebt` for many reserves in one multicall (hard-fail). Thin
 * DI wrapper over the SDK `getUserTotalDebts`; use only for reserves already
 * known to carry debt.
 */
export async function getUserTotalDebtsBatch(
  spokeAddress: Address,
  reserveIds: bigint[],
  userAddress: Address,
): Promise<bigint[]> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetUserTotalDebts(
    publicClient,
    spokeAddress,
    reserveIds,
    userAddress,
  );
}

/**
 * Read the Core Spoke's cap on how many reserves one account may hold. Thin DI
 * wrapper over the SDK `getMaxUserReservesLimit`; the raw contract value,
 * including the unlimited sentinel.
 */
export async function getMaxUserReservesLimit(
  spokeAddress: Address,
): Promise<number> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetMaxUserReservesLimit(publicClient, spokeAddress);
}

/**
 * Get the liquidation-bonus curve parameters from the Core Spoke contract.
 *
 * @param spokeAddress - Core Spoke contract address
 * @returns healthFactorForMaxBonus (WAD) and liquidationBonusFactor (BPS)
 */
export async function getLiquidationBonusConfig(
  spokeAddress: Address,
): Promise<LiquidationBonusConfig> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetLiquidationBonusConfig(publicClient, spokeAddress);
}

/**
 * Get reserve data from the Core Spoke contract via the `getReserve` selector.
 *
 * Used as a fallback when reserve data is not available from the GraphQL indexer.
 * Note: distinct from the contract's separate `getReserveConfig` function.
 *
 * @param spokeAddress - Core Spoke contract address
 * @param reserveId - Reserve ID
 * @returns Reserve data including dynamicConfigKey
 */
export async function getReserve(spokeAddress: Address, reserveId: bigint) {
  const publicClient = ethClient.getPublicClient();
  return sdkGetReserve(publicClient, spokeAddress, reserveId);
}

/** On-chain `ISpoke.Reserve`, as returned by `getReserve`. */
export type AaveSpokeReserve = Awaited<ReturnType<typeof sdkGetReserve>>;

/**
 * Read `getReserve` for many reserves in one multicall (hard-fail). Thin DI
 * wrapper over the SDK `getReserves`. Any revert, including an id the spoke
 * never listed, rejects the whole batch, so a caller proving reserves against
 * the chain fails closed.
 */
export async function getReservesBatch(
  spokeAddress: Address,
  reserveIds: bigint[],
): Promise<AaveSpokeReserve[]> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetReserves(publicClient, spokeAddress, reserveIds);
}

/**
 * Get the dynamic reserve config from the Core Spoke contract.
 *
 * Returns collateral factor, max liquidation bonus, and liquidation fee
 * for a specific reserve and dynamic config key.
 *
 * @param spokeAddress - Core Spoke contract address
 * @param reserveId - Reserve ID (e.g., vBTC reserve ID from indexer config)
 * @param dynamicConfigKey - Dynamic config key (from reserve data)
 * @returns Dynamic reserve config with collateralFactor (BPS), maxLiquidationBonus (BPS), liquidationFee (BPS)
 */
export async function getDynamicReserveConfig(
  spokeAddress: Address,
  reserveId: bigint,
  dynamicConfigKey: number,
) {
  const publicClient = ethClient.getPublicClient();
  return sdkGetDynamicReserveConfig(
    publicClient,
    spokeAddress,
    reserveId,
    dynamicConfigKey,
  );
}

// Re-export types
export type { AaveSpokeUserAccountData, AaveSpokeUserPosition };
