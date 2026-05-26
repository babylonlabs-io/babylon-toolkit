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
  ActivityRow,
  ActivityType,
  LiquidationChildRow,
  LiquidationGroupRow,
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
  /** Core vault status from BTCVaultRegistry. Used for partial/full liquidation classification. */
  status: string | null;
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
        status
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

/**
 * Map non-liquidation GraphQL types to their display label. Liquidation rows
 * never reach this map — they are rolled up into LiquidationGroupRow with a
 * classification-derived label (Partially / Fully Liquidated).
 */
const TYPE_MAP: Record<
  Exclude<GraphQLActivityType, "liquidation">,
  ActivityType
> = {
  deposit: "Deposit",
  withdrawal: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  redeem: "Redeem",
  claim_expired: "Claim Expired",
};

function mapActivityType(type: GraphQLActivityType): ActivityType | undefined {
  if (type === "liquidation") return undefined;
  return TYPE_MAP[type];
}

/**
 * Classify each liquidation event as Partially / Fully Liquidated by walking
 * activities chronologically and tracking which vaults are still open at the
 * moment the liquidation lands. If any deposited vault remains uncleared
 * (not liquidated, withdrawn, or redeemed) right after this liquidation, it
 * is "Partially Liquidated"; otherwise "Fully Liquidated".
 *
 * This is point-in-time, not the current vault.status snapshot — a liquidation
 * that was partial at the time stays labelled partial even after later events
 * close out the remaining vaults.
 */
function classifyLiquidations(
  items: readonly GraphQLVaultActivityItem[],
): Map<string, "Partially Liquidated" | "Fully Liquidated"> {
  const result = new Map<string, "Partially Liquidated" | "Fully Liquidated">();
  const sortedAsc = [...items].sort(
    (a, b) => parseInt(a.timestamp, 10) - parseInt(b.timestamp, 10),
  );
  const deposited = new Set<string>();
  const closed = new Set<string>();

  for (const item of sortedAsc) {
    if (!item.vaultId) continue;
    if (item.type === "deposit") {
      deposited.add(item.vaultId);
      continue;
    }
    if (
      item.type === "liquidation" ||
      item.type === "withdrawal" ||
      item.type === "redeem"
    ) {
      closed.add(item.vaultId);
    }
    if (item.type === "liquidation") {
      const stillOpen = [...deposited].some((v) => !closed.has(v));
      result.set(
        item.id,
        stillOpen ? "Partially Liquidated" : "Fully Liquidated",
      );
    }
  }
  return result;
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

function buildLiquidationGroup(
  liquidation: GraphQLVaultActivityItem,
  repay: GraphQLVaultActivityItem | undefined,
  classification: "Partially Liquidated" | "Fully Liquidated",
  deps: FetchUserActivitiesDeps,
): LiquidationGroupRow {
  const collateralAmount: ActivityAmount = {
    value: formatAmount(liquidation.amount, BTC_DECIMALS),
    symbol: btcConfig.coinSymbol,
  };

  const repayReserve =
    repay && repay.debtReserveId != null
      ? deps.reserves.get(repay.debtReserveId)
      : undefined;
  const debtAmount: ActivityAmount | null = repay
    ? {
        value: repayReserve
          ? formatAmount(repay.amount, repayReserve.decimals)
          : repay.amount,
        symbol: repayReserve?.symbol ?? "—",
      }
    : null;
  const debtIcon = repayReserve?.icon ?? "";

  const children: LiquidationChildRow[] = [
    {
      id: `${liquidation.id}-collateral`,
      label: "Collateral Liquidated",
      amount: collateralAmount,
      tokenIcon: btcConfig.icon,
      chain: "ETH",
      transactionHash: liquidation.transactionHash,
      date: new Date(parseInt(liquidation.timestamp, 10) * 1000),
    },
  ];
  if (repay && debtAmount) {
    children.push({
      id: `${repay.id}-loan`,
      label: "Loan Repaid",
      amount: debtAmount,
      tokenIcon: debtIcon,
      chain: "ETH",
      transactionHash: repay.transactionHash,
      date: new Date(parseInt(repay.timestamp, 10) * 1000),
    });
  }

  return {
    kind: "liquidationGroup",
    id: liquidation.id,
    date: new Date(parseInt(liquidation.timestamp, 10) * 1000),
    type: classification,
    tokenIcons: [btcConfig.icon, debtIcon],
    summary: {
      collateral: collateralAmount,
      debt: debtAmount,
    },
    children,
    transactionHash: liquidation.transactionHash,
  };
}

function projectStandardRow(
  item: GraphQLVaultActivityItem,
  peginTxHashByVaultId: ReadonlyMap<string, string>,
  deps: FetchUserActivitiesDeps,
): ActivityLog | undefined {
  const displayType = mapActivityType(item.type);
  if (!displayType) return undefined;

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

  return {
    kind: "row",
    id: item.id,
    date: new Date(parseInt(item.timestamp, 10) * 1000),
    tokenIcon,
    type: displayType,
    amount,
    chain,
    transactionHash,
  };
}

export async function fetchUserActivities(
  address: Address,
  deps: FetchUserActivitiesDeps,
): Promise<ActivityRow[]> {
  const data = await graphqlClient.request<GraphQLActivityPageResponse>(
    GET_ACTIVITIES_PAGE,
    { depositor: address.toLowerCase() },
  );

  if (data.vaultActivitys.items.length === 0) return [];

  const peginTxHashByVaultId = new Map<string, string>();
  for (const v of data.vaults.items) {
    peginTxHashByVaultId.set(v.id, v.peginTxHash);
  }

  // Sibling repay events fire in the same EVM tx as a VaultLiquidated event.
  // Indexed by tx hash so liquidations can grab their repay child in one lookup.
  const repayByTxHash = new Map<string, GraphQLVaultActivityItem>();
  for (const item of data.vaultActivitys.items) {
    if (item.type === "repay") {
      repayByTxHash.set(item.transactionHash, item);
    }
  }

  const liquidationClassification = classifyLiquidations(
    data.vaultActivitys.items,
  );

  const sorted = [...data.vaultActivitys.items].sort((a, b) => {
    const tsDiff = parseInt(b.timestamp, 10) - parseInt(a.timestamp, 10);
    if (tsDiff !== 0) return tsDiff;
    const blockDiff = parseInt(b.blockNumber, 10) - parseInt(a.blockNumber, 10);
    if (blockDiff !== 0) return blockDiff;
    return parseLogIndex(b.id) - parseLogIndex(a.id);
  });

  // Pre-mark repay rows that will be rolled into a liquidation group. The
  // sorted iteration is desc by (timestamp, blockNumber, logIndex), so the
  // sibling repay (higher logIndex) typically lands before the liquidation
  // that would consume it — we must know up-front which ids to skip.
  const consumedIds = new Set<string>();
  for (const item of data.vaultActivitys.items) {
    if (item.type === "liquidation") {
      const repay = repayByTxHash.get(item.transactionHash);
      if (repay) consumedIds.add(repay.id);
    }
  }

  const droppedTypeCounts = new Map<string, number>();
  const rows: ActivityRow[] = [];

  for (const item of sorted) {
    if (consumedIds.has(item.id)) continue;

    if (item.type === "liquidation") {
      const classification =
        liquidationClassification.get(item.id) ?? "Partially Liquidated";
      const repay = repayByTxHash.get(item.transactionHash);
      rows.push(buildLiquidationGroup(item, repay, classification, deps));
      continue;
    }

    const projected = projectStandardRow(item, peginTxHashByVaultId, deps);
    if (projected) {
      rows.push(projected);
    } else {
      droppedTypeCounts.set(
        item.type,
        (droppedTypeCounts.get(item.type) ?? 0) + 1,
      );
    }
  }

  if (droppedTypeCounts.size > 0) {
    logger.warn("[fetchActivities] dropped unrecognised activity types", {
      counts: Object.fromEntries(droppedTypeCounts),
    });
  }

  return rows;
}
