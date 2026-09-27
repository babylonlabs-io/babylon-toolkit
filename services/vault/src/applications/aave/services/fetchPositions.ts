/**
 * Aave Positions Service
 *
 * Fetches Aave position data from the GraphQL indexer.
 * Positions represent user lending positions with collateral.
 * Position is keyed by depositor address (one position per user).
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave position from GraphQL indexer
 * Position is active if totalCollateral > 0
 * Keyed by depositorAddress (one position per user).
 */
export interface AavePosition {
  /** Depositor's ETH address (primary key) */
  depositorAddress: string;
  /** Proxy contract holding the position */
  proxyContract: string;
  /** Total vBTC collateral (8 decimals) */
  totalCollateral: bigint;
  /** Creation timestamp */
  createdAt: bigint;
  /** Last update timestamp */
  updatedAt: bigint;
}

/**
 * Aave position collateral entry
 * Tracks which vaults are used as collateral in a position.
 * Composite primary key: (depositorAddress, vaultId)
 */
export interface AavePositionCollateral {
  /** Depositor's ETH address (part of composite key) */
  depositorAddress: string;
  /** Vault ID: keccak256(abi.encode(peginTxHash, depositor)) (part of composite key) */
  vaultId: string;
  /** Collateral amount from this vault */
  amount: bigint;
  /** Timestamp when added */
  addedAt: bigint;
  /** Timestamp when removed (null if still active) */
  removedAt: bigint | null;
  /** Liquidation priority index (0 = seized first). Updated on VaultsReordered events. */
  liquidationIndex: number;
  /** Associated vault data */
  vault?: {
    id: string;
    peginTxHash: string;
    amount: bigint;
    status: string;
    vaultProvider: string;
    inUse: boolean;
    depositorBtcPubKey: string;
    /** On-chain registered payout scriptPubKey (0x-prefixed hex). Where BTC is sent on withdraw. */
    depositorPayoutBtcAddress: string;
    /**
     * Unsigned pre-pegin BTC transaction hex (from PegInSubmitted event).
     * Needed to re-derive the VP auth anchor when the in-memory token
     * registry is cold (e.g. collateral artifact re-download).
     */
    unsignedPrePeginTx?: string;
    /** Offchain-params version this vault was created under. Used to resolve
     * the vault's peg-out timelocks (e.g. `timelockAssert`) for ETAs.
     * Optional: GraphQL data is untrusted; absent → ETA hidden, never NaN. */
    offchainParamsVersion?: number;
  };
}

/**
 * Position with collaterals combined
 */
export interface AavePositionWithCollaterals extends AavePosition {
  collaterals: AavePositionCollateral[];
}

/** GraphQL position item shape */
interface GraphQLPositionItem {
  depositorAddress: string;
  proxyContract: string;
  totalCollateral: string;
  createdAt: string;
  updatedAt: string;
}

/** GraphQL collateral item shape */
interface GraphQLCollateralItem {
  depositorAddress: string;
  vaultId: string;
  amount: string;
  addedAt: string;
  removedAt: string | null;
  liquidationIndex: string;
  vault?: {
    id: string;
    peginTxHash: string;
    amount: string;
    status: string;
    vaultProvider: string;
    inUse: boolean;
    depositorBtcPubKey: string;
    depositorPayoutBtcAddress: string;
    unsignedPrePeginTx?: string;
    offchainParamsVersion?: number;
  };
}

/** GraphQL response for user positions */
interface GraphQLUserPositionsResponse {
  aavePositions: {
    items: GraphQLPositionItem[];
  };
}

/** GraphQL response for one page of position collaterals */
interface GraphQLPositionCollateralsResponse {
  aavePositionCollaterals: {
    items: GraphQLCollateralItem[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

/**
 * Page size for the collateral query. Ponder caps an un-paginated query at 50
 * rows, and 1000 is its maximum per-page limit.
 */
const COLLATERALS_PAGE_SIZE = 1000;

/** Backstop against a runaway cursor loop (50 pages × 1000 rows). */
const MAX_COLLATERAL_PAGES = 50;

const GET_AAVE_POSITIONS = gql`
  query GetAavePositions($depositorAddress: String!) {
    aavePositions(where: { depositorAddress: $depositorAddress }) {
      items {
        depositorAddress
        proxyContract
        totalCollateral
        createdAt
        updatedAt
      }
    }
  }
`;

/**
 * The indexer never deletes collateral rows: withdrawn and liquidated vaults
 * stay. The query must walk every page, or live rows drop out once the
 * depositor has more rows than one page holds.
 */
const GET_AAVE_POSITION_COLLATERALS = gql`
  query GetAavePositionCollaterals(
    $depositorAddress: String!
    $limit: Int!
    $after: String
  ) {
    aavePositionCollaterals(
      where: { depositorAddress: $depositorAddress }
      limit: $limit
      after: $after
    ) {
      items {
        depositorAddress
        vaultId
        amount
        addedAt
        removedAt
        liquidationIndex
        vault {
          id
          peginTxHash
          amount
          status
          vaultProvider
          inUse
          depositorBtcPubKey
          depositorPayoutBtcAddress
          unsignedPrePeginTx
          offchainParamsVersion
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Maps a GraphQL position item to AavePosition
 */
function mapGraphQLPositionToAavePosition(
  item: GraphQLPositionItem,
): AavePosition {
  return {
    depositorAddress: item.depositorAddress,
    proxyContract: item.proxyContract,
    totalCollateral: BigInt(item.totalCollateral),
    createdAt: BigInt(item.createdAt),
    updatedAt: BigInt(item.updatedAt),
  };
}

/**
 * Maps a GraphQL collateral item to AavePositionCollateral
 */
function mapGraphQLCollateralToAavePositionCollateral(
  item: GraphQLCollateralItem,
): AavePositionCollateral {
  return {
    depositorAddress: item.depositorAddress,
    vaultId: item.vaultId,
    amount: BigInt(item.amount),
    addedAt: BigInt(item.addedAt),
    removedAt: item.removedAt ? BigInt(item.removedAt) : null,
    liquidationIndex: Number(item.liquidationIndex),
    vault: item.vault
      ? {
          id: item.vault.id,
          peginTxHash: item.vault.peginTxHash,
          amount: BigInt(item.vault.amount),
          status: item.vault.status,
          vaultProvider: item.vault.vaultProvider,
          inUse: item.vault.inUse,
          depositorBtcPubKey: item.vault.depositorBtcPubKey,
          depositorPayoutBtcAddress: item.vault.depositorPayoutBtcAddress,
          unsignedPrePeginTx: item.vault.unsignedPrePeginTx,
          offchainParamsVersion:
            item.vault.offchainParamsVersion == null
              ? undefined
              : Number(item.vault.offchainParamsVersion),
        }
      : undefined,
  };
}

/**
 * Fetches every collateral row of a depositor. Throws instead of returning a
 * partial list.
 */
async function fetchAllCollaterals(
  depositorAddress: string,
): Promise<GraphQLCollateralItem[]> {
  const collaterals: GraphQLCollateralItem[] = [];
  let after: string | null = null;

  for (let page = 0; page < MAX_COLLATERAL_PAGES; page++) {
    // Annotated because `after` is assigned from `pageInfo` below and also
    // feeds this call's variables; without it TS reports the cycle as TS7022.
    const {
      items,
      pageInfo,
    }: GraphQLPositionCollateralsResponse["aavePositionCollaterals"] = (
      await graphqlClient.request<GraphQLPositionCollateralsResponse>(
        GET_AAVE_POSITION_COLLATERALS,
        { depositorAddress, limit: COLLATERALS_PAGE_SIZE, after },
      )
    ).aavePositionCollaterals;
    collaterals.push(...items);

    if (!pageInfo.hasNextPage) return collaterals;
    if (!pageInfo.endCursor) {
      throw new Error(
        `Indexer reported another collateral page but no cursor after page ` +
          `${page + 1} for ${depositorAddress}; the collateral list would be ` +
          `incomplete`,
      );
    }
    after = pageInfo.endCursor;
  }

  throw new Error(
    `More than ${MAX_COLLATERAL_PAGES * COLLATERALS_PAGE_SIZE} collateral ` +
      `rows for ${depositorAddress}; raise MAX_COLLATERAL_PAGES rather than ` +
      `returning an incomplete collateral list`,
  );
}

/**
 * Fetches active Aave positions with all their collaterals.
 *
 * @param depositor - User's Ethereum address
 * @returns Array of active Aave positions with collaterals
 */
export async function fetchAaveActivePositionsWithCollaterals(
  depositor: string,
): Promise<AavePositionWithCollaterals[]> {
  const depositorAddress = depositor.toLowerCase();
  const [response, collaterals] = await Promise.all([
    graphqlClient.request<GraphQLUserPositionsResponse>(GET_AAVE_POSITIONS, {
      depositorAddress,
    }),
    fetchAllCollaterals(depositorAddress),
  ]);

  // Positions are keyed by depositor, so every collateral row belongs to the
  // one position the query can return.
  return response.aavePositions.items.map((item) => ({
    ...mapGraphQLPositionToAavePosition(item),
    collaterals: collaterals.map(mapGraphQLCollateralToAavePositionCollateral),
  }));
}
