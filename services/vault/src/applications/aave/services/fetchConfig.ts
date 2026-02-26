/**
 * Aave Config Service
 *
 * Fetches Aave configuration (contract addresses, reserve IDs) from the GraphQL indexer.
 * This is a singleton configuration that should be fetched once and cached.
 */

import { gql } from "graphql-request";
import type { Address } from "viem";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave configuration from GraphQL indexer
 * Contains contract addresses and reserve IDs discovered from the AaveIntegrationController
 */
export interface AaveConfig {
  /** AaveIntegrationController contract address */
  controllerAddress: string;
  /** VaultBTC token address */
  vaultBtcAddress: string;
  /** BTCVaultsManager contract address */
  btcVaultManagerAddress: string;
  /** Core Spoke contract address (for user lending positions) */
  btcVaultCoreSpokeAddress: string;
  /** Core Spoke proxy implementation address */
  btcVaultCoreSpokeProxyImplementation: string;
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
    controllerAddress: string;
    vaultBtcAddress: string;
    btcVaultManagerAddress: string;
    btcVaultCoreSpokeAddress: string;
    btcVaultCoreSpokeProxyImplementation: string;
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
      controllerAddress
      vaultBtcAddress
      btcVaultManagerAddress
      btcVaultCoreSpokeAddress
      btcVaultCoreSpokeProxyImplementation
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

  const config: AaveConfig = {
    controllerAddress: response.aaveConfig.controllerAddress,
    vaultBtcAddress: response.aaveConfig.vaultBtcAddress,
    btcVaultManagerAddress: response.aaveConfig.btcVaultManagerAddress,
    btcVaultCoreSpokeAddress: response.aaveConfig.btcVaultCoreSpokeAddress,
    btcVaultCoreSpokeProxyImplementation:
      response.aaveConfig.btcVaultCoreSpokeProxyImplementation,
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

/** GraphQL response shape for config only */
interface GraphQLAaveConfigResponse {
  aaveConfig: {
    id: number;
    controllerAddress: string;
    vaultBtcAddress: string;
    btcVaultManagerAddress: string;
    btcVaultCoreSpokeAddress: string;
    btcVaultCoreSpokeProxyImplementation: string;
    btcVaultCoreVbtcReserveId: string;
  } | null;
}

const GET_AAVE_CONFIG = gql`
  query GetAaveConfig {
    aaveConfig(id: ${AAVE_CONFIG_ID}) {
      id
      controllerAddress
      vaultBtcAddress
      btcVaultManagerAddress
      btcVaultCoreSpokeAddress
      btcVaultCoreSpokeProxyImplementation
      btcVaultCoreVbtcReserveId
    }
  }
`;

/**
 * Fetches Aave configuration from the GraphQL indexer.
 */
export async function fetchAaveConfig(): Promise<AaveConfig | null> {
  const response =
    await graphqlClient.request<GraphQLAaveConfigResponse>(GET_AAVE_CONFIG);

  if (!response.aaveConfig) {
    return null;
  }

  return {
    controllerAddress: response.aaveConfig.controllerAddress,
    vaultBtcAddress: response.aaveConfig.vaultBtcAddress,
    btcVaultManagerAddress: response.aaveConfig.btcVaultManagerAddress,
    btcVaultCoreSpokeAddress: response.aaveConfig.btcVaultCoreSpokeAddress,
    btcVaultCoreSpokeProxyImplementation:
      response.aaveConfig.btcVaultCoreSpokeProxyImplementation,
    btcVaultCoreVbtcReserveId: BigInt(
      response.aaveConfig.btcVaultCoreVbtcReserveId,
    ),
  };
}
