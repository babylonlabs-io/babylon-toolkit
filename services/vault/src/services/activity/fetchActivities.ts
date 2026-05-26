import { gql } from "graphql-request";
import type { Address } from "viem";
import { formatUnits } from "viem";

import { graphqlClient } from "../../clients/graphql";
import { getNetworkConfigBTC } from "../../config";
import { logger } from "../../infrastructure";
import type {
  ActivityAmount,
  ActivityChain,
  ActivityLog,
  ActivityType,
} from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

// Native precision of a BTC vault amount (sats).
const BTC_DECIMALS = 8;

// Cap display precision so we never round the integer part of high-decimals
// tokens through JS number space. Fractional digits beyond this are dropped
// (not rounded) to keep formatting deterministic.
const MAX_DISPLAY_FRACTION_DIGITS = 8;

type GraphQLActivityType =
  | "deposit"
  | "withdrawal"
  | "liquidation"
  | "borrow"
  | "repay"
  | "redeem"
  | "claim_expired";

interface GraphQLVaultActivityItem {
  id: string;
  vaultId: string | null;
  depositor: string;
  type: GraphQLActivityType;
  amount: string;
  debtReserveId: string | null;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
}

interface GraphQLVaultItem {
  id: string;
  peginTxHash: string;
}

interface GraphQLActivityPageResponse {
  vaultActivitys: { items: GraphQLVaultActivityItem[] };
  vaults: { items: GraphQLVaultItem[] };
}

/**
 * The indexer encodes logIndex into the activity id as
 * `${transactionHash}-${logIndex}-${type}`. Parse it out for deterministic
 * same-tx ordering without requiring a dedicated column.
 */
function parseLogIndex(id: string): number {
  const parts = id.split("-");
  // parts[0] is transactionHash; parts[1] is logIndex.
  const n = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Single GraphQL request that pulls the activity rows AND, in the same round
 * trip, the vault rows referenced by those activities for pegin-hash
 * resolution. The frontend joins on `vault.id` client-side.
 *
 * We pass the depositor as a String into both queries: vaultActivitys uses it
 * directly, and vaults reuses it as a depositor filter so the indexer only
 * returns vault rows the user could conceivably reference.
 */
const GET_ACTIVITIES_PAGE = gql`
  query GetActivitiesPage($depositor: String!) {
    vaultActivitys(
      where: { depositor: $depositor }
      orderBy: "timestamp"
      orderDirection: "desc"
    ) {
      items {
        id
        vaultId
        depositor
        type
        amount
        debtReserveId
        timestamp
        blockNumber
        transactionHash
      }
    }
    vaults(where: { depositor: $depositor }) {
      items {
        id
        peginTxHash
      }
    }
  }
`;

/**
 * Activity types whose primary user-facing transaction is on Bitcoin (the peg-in tx).
 * Everything else is an EVM-only action (collateral ops, loans, liquidations, withdraw).
 */
const BTC_PRIMARY_ACTIVITIES: ReadonlySet<GraphQLActivityType> = new Set([
  "deposit",
]);

const TYPE_MAP: Record<GraphQLActivityType, ActivityType> = {
  deposit: "Deposit",
  withdrawal: "Withdraw",
  liquidation: "Liquidation",
  borrow: "Borrow",
  repay: "Repay",
  redeem: "Redeem",
  claim_expired: "Claim Expired",
};

function mapActivityType(type: string): ActivityType | undefined {
  return TYPE_MAP[type as GraphQLActivityType];
}

/**
 * Decide which hash + chain to surface in the "Transaction Hash" column.
 * For peg-in deposits we surface the BTC pegin txid (matches how the rest of
 * the dApp identifies a deposit). For all other activity types the meaningful
 * tx is the EVM event that triggered the indexer record.
 *
 * Fail closed for BTC-primary rows: if the indexer ever returns a missing or
 * malformed peg-in hash, keep chain="BTC" and emit an empty hash so the row
 * renders as "Pending..." rather than redirecting users to the ETH explorer
 * for what is logically a BTC operation.
 */
function resolveDisplayTx(
  item: GraphQLVaultActivityItem,
  peginTxHashByVaultId: ReadonlyMap<string, string>,
): {
  chain: ActivityChain;
  transactionHash: string;
} {
  if (BTC_PRIMARY_ACTIVITIES.has(item.type)) {
    const peginTxHash = item.vaultId
      ? peginTxHashByVaultId.get(item.vaultId)
      : undefined;
    const isValidPeginHash =
      typeof peginTxHash === "string" &&
      peginTxHash.length > 0 &&
      peginTxHash !== "0x";
    return {
      chain: "BTC",
      transactionHash: isValidPeginHash ? peginTxHash : "",
    };
  }
  return { chain: "ETH", transactionHash: item.transactionHash };
}

function formatAmount(amount: string, decimals: number): string {
  // Format whole/fraction separately to avoid parseFloat precision loss on
  // large or high-decimals values.
  const [wholeRaw, fracRaw = ""] = formatUnits(BigInt(amount), decimals).split(
    ".",
  );
  const whole = BigInt(wholeRaw).toLocaleString("en-US");
  const frac = fracRaw.slice(0, MAX_DISPLAY_FRACTION_DIGITS).replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole;
}

/**
 * Caller-injected dependencies. The hook layer reads these from the AaveConfig
 * context provider (which already loads them once at app startup), keeping
 * this service free of global registry / network dependencies for non-
 * activity data.
 */
export interface FetchUserActivitiesDeps {
  /** Map of debtReserveId -> { symbol, decimals, icon }, e.g. from `useAaveConfig().borrowableReserves`. */
  reserves: ReadonlyMap<
    string,
    { symbol: string; decimals: number; icon: string | undefined }
  >;
}

export async function fetchUserActivities(
  address: Address,
  deps: FetchUserActivitiesDeps,
): Promise<ActivityLog[]> {
  const data = await graphqlClient.request<GraphQLActivityPageResponse>(
    GET_ACTIVITIES_PAGE,
    { depositor: address.toLowerCase() },
  );

  if (data.vaultActivitys.items.length === 0) return [];

  const peginTxHashByVaultId = new Map<string, string>();
  for (const v of data.vaults.items) {
    peginTxHashByVaultId.set(v.id, v.peginTxHash);
  }

  const sorted = [...data.vaultActivitys.items].sort((a, b) => {
    const tsDiff = parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10);
    if (tsDiff !== 0) return tsDiff;
    const blockDiff = parseInt(b.blockNumber, 10) - parseInt(a.blockNumber, 10);
    if (blockDiff !== 0) return blockDiff;
    return parseLogIndex(b.id) - parseLogIndex(a.id);
  });

  const droppedTypeCounts = new Map<string, number>();

  const rows = sorted.flatMap((item): ActivityLog[] => {
    const displayType = mapActivityType(item.type);
    if (!displayType) {
      droppedTypeCounts.set(
        item.type,
        (droppedTypeCounts.get(item.type) ?? 0) + 1,
      );
      return [];
    }

    const isPositionScoped = item.type === "borrow" || item.type === "repay";
    const reserve =
      isPositionScoped && item.debtReserveId != null
        ? deps.reserves.get(item.debtReserveId)
        : undefined;

    const amount: ActivityAmount = isPositionScoped
      ? {
          value: reserve
            ? formatAmount(item.amount, reserve.decimals)
            : item.amount,
          symbol: reserve?.symbol ?? "—",
        }
      : {
          value: formatAmount(item.amount, BTC_DECIMALS),
          symbol: btcConfig.coinSymbol,
        };

    const tokenIcon = isPositionScoped ? (reserve?.icon ?? "") : btcConfig.icon;

    const { chain, transactionHash } = resolveDisplayTx(
      item,
      peginTxHashByVaultId,
    );

    return [
      {
        id: item.id,
        date: new Date(parseInt(item.timestamp, 10) * 1000),
        tokenIcon,
        type: displayType,
        amount,
        chain,
        transactionHash,
      },
    ];
  });

  if (droppedTypeCounts.size > 0) {
    logger.warn("[fetchActivities] dropped unrecognised activity types", {
      counts: Object.fromEntries(droppedTypeCounts),
    });
  }

  return rows;
}
