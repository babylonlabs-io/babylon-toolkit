/**
 * Aave Reserve Service
 *
 * Fetches available reserves from the indexer for user selection.
 * Reserves represent assets that can be borrowed against vBTC collateral.
 */

import type { Address } from "viem";

import { fetchAaveConfig, type AaveConfig } from "./fetchConfig";
import {
  fetchAaveReserveById,
  fetchAllAaveReserves,
  fetchBorrowableAaveReserves,
  type AaveReserve,
} from "./fetchReserves";

/**
 * Reserve with token metadata
 */
export interface AaveReserveWithMetadata {
  /** Reserve ID */
  reserveId: bigint;
  /** Reserve data */
  reserve: {
    underlying: Address;
    hub: Address;
    assetId: number;
    decimals: number;
    dynamicConfigKey: number;
    paused: boolean;
    frozen: boolean;
    borrowable: boolean;
    collateralRisk: number;
  };
  /** Token metadata */
  token: {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
  };
}

/**
 * Get Aave config from indexer
 */
async function getConfig(): Promise<AaveConfig> {
  const config = await fetchAaveConfig();
  if (!config) {
    throw new Error("Aave config not found in indexer");
  }
  return config;
}

/**
 * Get the Core Spoke address
 *
 * @returns Core Spoke contract address
 */
export async function getCoreSpokeAddress(): Promise<Address> {
  const config = await getConfig();
  return config.btcVaultCoreSpokeAddress as Address;
}

/**
 * Get the vBTC reserve ID on Core Spoke
 *
 * @returns vBTC reserve ID
 */
export async function getVbtcReserveId(): Promise<bigint> {
  const config = await getConfig();
  return config.btcVaultCoreVbtcReserveId;
}

/**
 * Convert indexer reserve to reserve with metadata format
 */
function toReserveWithMetadata(
  reserve: AaveReserve,
): AaveReserveWithMetadata | null {
  // Skip reserves without token metadata
  if (!reserve.underlyingToken) {
    return null;
  }

  return {
    reserveId: reserve.id,
    reserve: {
      underlying: reserve.underlying as Address,
      hub: reserve.hub as Address,
      assetId: reserve.assetId,
      decimals: reserve.decimals,
      dynamicConfigKey: reserve.dynamicConfigKey,
      paused: reserve.paused,
      frozen: reserve.frozen,
      borrowable: reserve.borrowable,
      collateralRisk: reserve.collateralRisk,
    },
    token: {
      address: reserve.underlyingToken.address as Address,
      symbol: reserve.underlyingToken.symbol,
      name: reserve.underlyingToken.name,
      decimals: reserve.underlyingToken.decimals,
    },
  };
}

/**
 * Get all available reserves from indexer
 *
 * @returns Array of reserves with metadata
 */
export async function getAvailableReserves(): Promise<
  AaveReserveWithMetadata[]
> {
  const reserves = await fetchAllAaveReserves();

  return reserves
    .filter((r) => !r.paused && !r.frozen)
    .map(toReserveWithMetadata)
    .filter((r): r is AaveReserveWithMetadata => r !== null);
}

/**
 * Get borrowable reserves (reserves that can be borrowed)
 *
 * @returns Array of borrowable reserves with metadata
 */
export async function getBorrowableReserves(): Promise<
  AaveReserveWithMetadata[]
> {
  const reserves = await fetchBorrowableAaveReserves();

  return reserves
    .map(toReserveWithMetadata)
    .filter((r): r is AaveReserveWithMetadata => r !== null);
}

/**
 * Get a specific reserve by ID
 *
 * @param reserveId - Reserve ID
 * @returns Reserve with metadata or null if not found
 */
export async function getReserveById(
  reserveId: bigint,
): Promise<AaveReserveWithMetadata | null> {
  const reserve = await fetchAaveReserveById(reserveId);

  if (!reserve) {
    return null;
  }

  return toReserveWithMetadata(reserve);
}

/**
 * Get the vBTC reserve (collateral reserve)
 *
 * @returns vBTC reserve with metadata
 */
export async function getVbtcReserve(): Promise<AaveReserveWithMetadata | null> {
  const config = await getConfig();
  return getReserveById(config.btcVaultCoreVbtcReserveId);
}
