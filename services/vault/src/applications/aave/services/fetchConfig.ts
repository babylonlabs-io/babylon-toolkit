/**
 * Aave Config Service
 *
 * Fetches Aave configuration (contract addresses, reserve IDs) from the GraphQL indexer.
 * This is a singleton configuration that should be fetched once and cached.
 */

import { gql } from "graphql-request";
import type { Address } from "viem";

import { graphqlClient } from "../../../clients/graphql";
import { getReservesBatch, type AaveSpokeReserve } from "../clients/spoke";
import {
  getCoreSpokeAddress,
  getVaultBtcReserveId,
} from "../clients/transaction";
import { getAaveAdapterAddress } from "../config";

import { ReserveMismatchError } from "./assertReserveMatchesOnChain";

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
  vaultBtcReserveId: bigint;
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
  /** Reserves available for new borrows (filtered by borrowable/paused/frozen) */
  borrowableReserves: AaveReserveConfig[];
  /**
   * All non-vBTC reserves regardless of borrowable/paused/frozen flags.
   * Used for resolving existing debt positions: a user can have debt in a
   * reserve that has since been frozen/paused/un-borrowable, and still needs
   * to repay it.
   */
  allBorrowReserves: AaveReserveConfig[];
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
    vaultBtcReserveId: string;
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
      vaultBtcReserveId
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

function assertAddressMatches(
  reserveId: bigint,
  field: string,
  indexed: Address,
  onChain: Address,
): void {
  if (indexed.toLowerCase() !== onChain.toLowerCase()) {
    throw new ReserveMismatchError(
      `Aave reserve ${reserveId} ${field} mismatch: indexer returned ${indexed}, expected ${onChain}`,
    );
  }
}

function assertNumberMatches(
  reserveId: bigint,
  field: string,
  indexed: number,
  onChain: number,
): void {
  if (indexed !== onChain) {
    throw new ReserveMismatchError(
      `Aave reserve ${reserveId} ${field} mismatch: indexer returned ${indexed}, expected ${onChain}`,
    );
  }
}

/**
 * Proves every indexed reserve's identity against the Core Spoke's
 * `getReserve`, in one hard-fail multicall, and throws `ReserveMismatchError`
 * on any disagreement.
 *
 * `hub` is the contract every rate and liquidity read targets, `assetId` keys
 * those reads, and `decimals` scales every amount shown for the reserve. An
 * indexer that kept `reserveId -> underlying` truthful but rewrote any of them
 * would put a false picture of chain state in front of an irreversible borrow.
 * All of these are fixed when a reserve is listed, so a mismatch is never
 * indexer lag. Mutable fields (paused, frozen, borrowable, risk parameters)
 * are deliberately not compared: they change legitimately, and the indexer
 * trails them by its refresh interval.
 *
 * A reserve id the indexer lists more than once is rejected before the read.
 *
 * A mismatch is a conclusion, not a fault, so the config query does not retry
 * it. A failed read stays an ordinary error and is retried.
 */
async function assertReservesMatchOnChain(
  coreSpokeAddress: Address,
  reserves: AaveReserveConfig[],
): Promise<void> {
  if (reserves.length === 0) {
    return;
  }

  // A repeated id would pass the identity check once per copy while each copy
  // carries its own unproven labels and flags, leaving the indexer to choose
  // which one downstream lookups keep.
  const seenReserveIds = new Set<bigint>();
  for (const { reserveId } of reserves) {
    if (seenReserveIds.has(reserveId)) {
      throw new ReserveMismatchError(
        `Aave indexer listed reserve ${reserveId} more than once`,
      );
    }
    seenReserveIds.add(reserveId);
  }

  let onChainReserves: AaveSpokeReserve[];
  try {
    onChainReserves = await getReservesBatch(
      coreSpokeAddress,
      reserves.map((r) => r.reserveId),
    );
  } catch (error) {
    throw new Error(
      `Failed to read reserves from Core Spoke ${coreSpokeAddress}`,
      { cause: error },
    );
  }

  reserves.forEach((indexed, index) => {
    const onChain = onChainReserves[index];
    if (onChain === undefined) {
      throw new Error(
        `Core Spoke ${coreSpokeAddress} returned no reserve for indexed reserve ${indexed.reserveId}`,
      );
    }
    const { reserveId } = indexed;
    assertAddressMatches(
      reserveId,
      "underlying",
      indexed.reserve.underlying,
      onChain.underlying,
    );
    assertAddressMatches(
      reserveId,
      "token address",
      indexed.token.address,
      onChain.underlying,
    );
    assertAddressMatches(reserveId, "hub", indexed.reserve.hub, onChain.hub);
    assertNumberMatches(
      reserveId,
      "asset ID",
      indexed.reserve.assetId,
      onChain.assetId,
    );
    assertNumberMatches(
      reserveId,
      "decimals",
      indexed.reserve.decimals,
      onChain.decimals,
    );
    assertNumberMatches(
      reserveId,
      "token decimals",
      indexed.token.decimals,
      onChain.decimals,
    );
  });
}

/**
 * Fetches all Aave app configuration in a single GraphQL request.
 *
 * This combines:
 * - Aave config (contract addresses, reserve IDs)
 * - vBTC reserve config (for liquidation threshold)
 * - Borrowable reserves (for asset selection)
 *
 * Every returned reserve's underlying, hub, asset ID and decimals have been
 * proven against the Core Spoke, so callers can use them directly.
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

  const adapterAddress = getAaveAdapterAddress();
  const indexedAdapterAddress = response.aaveConfig.adapterAddress as Address;
  if (indexedAdapterAddress.toLowerCase() !== adapterAddress.toLowerCase()) {
    throw new Error(
      `Aave adapter mismatch: indexer returned ${indexedAdapterAddress}, expected ${adapterAddress}`,
    );
  }

  // Resolve spoke address on-chain from the env-pinned adapter contract,
  // rather than trusting a GraphQL-supplied adapter.
  let coreSpokeAddress: Address;
  try {
    coreSpokeAddress = await getCoreSpokeAddress(adapterAddress);
  } catch (error) {
    throw new Error(
      `Failed to resolve Core Spoke address from adapter ${adapterAddress}`,
      { cause: error },
    );
  }

  // Resolve the vBTC reserve ID on-chain from the env-pinned adapter and treat
  // the immutable getter as the source of truth. The GraphQL value is only a
  // mirror to cross-check: a compromised indexer could otherwise point split /
  // liquidation math at a different reserve while keeping the adapter address
  // equal. Fail closed on disagreement or read failure.
  let onChainReserveId: bigint;
  try {
    onChainReserveId = await getVaultBtcReserveId(adapterAddress);
  } catch (error) {
    throw new Error(
      `Failed to resolve vBTC reserve ID from adapter ${adapterAddress}`,
      { cause: error },
    );
  }
  if (onChainReserveId !== BigInt(response.aaveConfig.vaultBtcReserveId)) {
    throw new ReserveMismatchError(
      `Aave vBTC reserve ID mismatch: indexer returned ${response.aaveConfig.vaultBtcReserveId}, expected ${onChainReserveId}`,
    );
  }
  const vbtcReserveId = onChainReserveId;

  const config: AaveConfig = {
    adapterAddress,
    vaultBtcAddress: response.aaveConfig.vaultBtcAddress,
    btcVaultRegistryAddress: response.aaveConfig.btcVaultRegistryAddress,
    coreSpokeAddress,
    vaultBtcReserveId: vbtcReserveId,
  };

  // Map all reserves
  const allReserves = response.aaveReserves.items
    .map(mapReserveConfig)
    .filter((r): r is AaveReserveConfig => r !== null);

  await assertReservesMatchOnChain(coreSpokeAddress, allReserves);

  // Find vBTC reserve by ID
  const vbtcReserve =
    allReserves.find((r) => r.reserveId === vbtcReserveId) ?? null;

  // All non-vBTC reserves (no flag filters). Used for resolving existing debt
  // positions in reserves that may have since been frozen/paused/un-borrowable.
  const allBorrowReserves = allReserves.filter(
    (r) => r.reserveId !== vbtcReserveId,
  );

  // Filter borrowable reserves:
  // - borrowable flag is true
  // - not paused or frozen
  // - NOT the vBTC reserve (vBTC is collateral-only, users deposit it but can't borrow it)
  const borrowableReserves = allBorrowReserves.filter(
    (r) => r.reserve.borrowable && !r.reserve.paused && !r.reserve.frozen,
  );

  return {
    config,
    vbtcReserve,
    borrowableReserves,
    allBorrowReserves,
  };
}
