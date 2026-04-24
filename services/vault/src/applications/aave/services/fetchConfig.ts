/**
 * Aave Config Service
 *
 * Fetches Aave configuration (contract addresses, reserve IDs) from the GraphQL indexer.
 * This is a singleton configuration that should be fetched once and cached.
 */

import { gql } from "graphql-request";
import type { Address } from "viem";

import { graphqlClient } from "../../../clients/graphql";
import { getCoreSpokeAddress } from "../clients/transaction";

/**
 * Aave configuration from GraphQL indexer
 * Contains contract addresses and reserve IDs discovered from the AaveIntegrationAdapter
 */
export interface AaveConfig {
  /** AaveIntegrationAdapter contract address */
  adapterAddress: string;
  /** VaultBTC token address */
  vaultBtcAddress: string;
  /** BTCVaultRegistry contract address */
  btcVaultRegistryAddress: string;
  /** Core Spoke contract address (resolved on-chain from adapter) */
  coreSpokeAddress: Address;
  /** vBTC reserve ID on Core Spoke */
  btcVaultCoreVbtcReserveId: bigint;
}

/**
 * Reserve with token metadata (used for vBTC reserve and borrowable reserves)
 */
export interface AaveReserveConfig {
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
    /** Collateral factor (liquidation threshold) in BPS from DynamicReserveConfig */
    collateralFactor: number;
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
 * Combined Aave app config fetched in a single GraphQL request
 */
export interface AaveAppConfig {
  /** Contract addresses and reserve IDs */
  config: AaveConfig;
  /** vBTC reserve configuration (collateral reserve) */
  vbtcReserve: AaveReserveConfig | null;
  /** List of reserves that can be borrowed */
  borrowableReserves: AaveReserveConfig[];
}

/**
 * Aave config singleton ID.
 * The indexer stores one global config record with this ID.
 */
const AAVE_CONFIG_ID = 1;

/** GraphQL reserve item shape */
interface GraphQLReserveItem {
  id: string;
  underlying: string;
  hub: string;
  assetId: number;
  decimals: number;
  dynamicConfigKey: number;
  paused: boolean;
  frozen: boolean;
  borrowable: boolean;
  collateralRisk: number;
  collateralFactor: number;
  underlyingToken: {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
  } | null;
}

/** GraphQL response shape for combined query */
interface GraphQLAaveAppConfigResponse {
  aaveConfig: {
    id: number;
    adapterAddress: string;
    vaultBtcAddress: string;
    btcVaultRegistryAddress: string;
    btcVaultCoreVbtcReserveId: string;
  } | null;
  /** All reserves (we filter for vBTC and borrowable in code) */
  aaveReserves: {
    items: GraphQLReserveItem[];
  };
}

/**
 * Single GraphQL query to fetch all app config:
 * - Aave config (addresses, reserve IDs)
 * - All reserves (filtered in code for vBTC and borrowable)
 */
const GET_AAVE_APP_CONFIG = gql`
  query GetAaveAppConfig {
    aaveConfig(id: ${AAVE_CONFIG_ID}) {
      id
      adapterAddress
      vaultBtcAddress
      btcVaultRegistryAddress
      btcVaultCoreVbtcReserveId
    }
    aaveReserves {
      items {
        id
        underlying
        hub
        assetId
        decimals
        dynamicConfigKey
        paused
        frozen
        borrowable
        collateralRisk
        collateralFactor
        underlyingToken {
          address
          symbol
          name
          decimals
        }
      }
    }
  }
`;

/**
 * Maps GraphQL reserve to AaveReserveConfig
 */
function mapReserveConfig(raw: GraphQLReserveItem): AaveReserveConfig | null {
  if (!raw.underlyingToken) {
    return null;
  }

  return {
    reserveId: BigInt(raw.id),
    reserve: {
      underlying: raw.underlying as Address,
      hub: raw.hub as Address,
      assetId: raw.assetId,
      decimals: raw.decimals,
      dynamicConfigKey: raw.dynamicConfigKey,
      paused: raw.paused,
      frozen: raw.frozen,
      borrowable: raw.borrowable,
      collateralRisk: raw.collateralRisk,
      collateralFactor: raw.collateralFactor,
    },
    token: {
      address: raw.underlyingToken.address as Address,
      symbol: raw.underlyingToken.symbol,
      name: raw.underlyingToken.name,
      decimals: raw.underlyingToken.decimals,
    },
  };
}

/**
 * Fetches all Aave app configuration in a single GraphQL request.
 *
 * This combines:
 * - Aave config (contract addresses, reserve IDs)
 * - vBTC reserve config (for liquidation threshold)
 * - Borrowable reserves (for asset selection)
 *
 * @returns Combined app config or null if config not found
 */
export async function fetchAaveAppConfig(): Promise<AaveAppConfig | null> {
  const response =
    await graphqlClient.request<GraphQLAaveAppConfigResponse>(
      GET_AAVE_APP_CONFIG,
    );

  if (!response.aaveConfig) {
    return null;
  }

  const vbtcReserveId = BigInt(response.aaveConfig.btcVaultCoreVbtcReserveId);

  // Resolve spoke address on-chain from the trusted adapter contract,
  // rather than relying on the untrusted GraphQL indexer
  const adapterAddress = response.aaveConfig.adapterAddress as Address;
  const coreSpokeAddress = await getCoreSpokeAddress(adapterAddress);

  const config: AaveConfig = {
    adapterAddress: response.aaveConfig.adapterAddress,
    vaultBtcAddress: response.aaveConfig.vaultBtcAddress,
    btcVaultRegistryAddress: response.aaveConfig.btcVaultRegistryAddress,
    coreSpokeAddress,
    btcVaultCoreVbtcReserveId: vbtcReserveId,
  };

  // Map all reserves
  const allReserves = response.aaveReserves.items
    .map(mapReserveConfig)
    .filter((r): r is AaveReserveConfig => r !== null);

  // Find vBTC reserve by ID
  const vbtcReserve =
    allReserves.find((r) => r.reserveId === vbtcReserveId) ?? null;

  // Filter borrowable reserves:
  // - borrowable flag is true
  // - not paused or frozen
  // - NOT the vBTC reserve (vBTC is collateral-only, users deposit it but can't borrow it)
  const borrowableReserves = allReserves.filter(
    (r) =>
      r.reserve.borrowable &&
      !r.reserve.paused &&
      !r.reserve.frozen &&
      r.reserveId !== vbtcReserveId,
  );

  return {
    config,
    vbtcReserve,
    borrowableReserves,
  };
}
