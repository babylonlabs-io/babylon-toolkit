import { gql } from "graphql-request";
import type { Address } from "viem";
import { formatUnits } from "viem";

import {
  getApplication,
  getApplicationMetadataByController,
} from "../../applications";
import { AAVE_APP_ID } from "../../applications/aave/config";
import { graphqlClient } from "../../clients/graphql";
import { getNetworkConfigBTC } from "../../config";
import { logger } from "../../infrastructure";
import type { ActivityLog, ActivityType } from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

type GraphQLActivityType =
  | "deposit"
  | "withdrawal"
  | "add_collateral"
  | "remove_collateral"
  | "liquidation"
  | "borrow"
  | "repay"
  | "redeem";

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

/**
 * The indexer encodes logIndex into the activity id as
 * `${transactionHash}-${logIndex}-${type}-${vaultId ?? "nil"}`. Parse it out
 * for deterministic same-tx ordering without requiring a dedicated column.
 */
function parseLogIndex(id: string): number {
  const parts = id.split("-");
  // parts[0] is transactionHash; parts[1] is logIndex.
  const n = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

interface GraphQLVaultActivitiesResponse {
  vaultActivitys: {
    items: GraphQLVaultActivityItem[];
  };
}

interface GraphQLVaultItem {
  id: string;
  applicationEntryPoint: string;
}

interface GraphQLVaultsResponse {
  vaults: {
    items: GraphQLVaultItem[];
  };
}

interface GraphQLReserveItem {
  id: string;
  decimals: number;
  underlyingToken: {
    symbol: string;
    decimals: number;
  } | null;
}

interface GraphQLReservesResponse {
  aaveReserves: {
    items: GraphQLReserveItem[];
  };
}

const GET_USER_ACTIVITIES = gql`
  query GetUserActivities($depositor: String!) {
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
  }
`;

const GET_VAULTS_BY_IDS = gql`
  query GetVaultsByIds($vaultIds: [String!]!) {
    vaults(where: { id_in: $vaultIds }) {
      items {
        id
        applicationEntryPoint
      }
    }
  }
`;

const GET_RESERVES_BY_IDS = gql`
  query GetReservesByIds($ids: [BigInt!]!) {
    aaveReserves(where: { id_in: $ids }) {
      items {
        id
        decimals
        underlyingToken {
          symbol
          decimals
        }
      }
    }
  }
`;

function mapActivityType(type: GraphQLActivityType): ActivityType {
  const typeMap: Record<GraphQLActivityType, ActivityType> = {
    deposit: "Deposit",
    withdrawal: "Withdraw",
    add_collateral: "Add Collateral",
    remove_collateral: "Remove Collateral",
    liquidation: "Liquidation",
    borrow: "Borrow",
    repay: "Repay",
    redeem: "Redeem",
  };
  const mapped = typeMap[type];
  if (!mapped) {
    throw new Error(`Unknown activity type from GraphQL API: ${type}`);
  }
  return mapped;
}

// Native precision of a BTC vault amount (sats).
const BTC_DECIMALS = 8;

// Cap display precision so we never round the integer part of high-decimals
// tokens through JS number space. Fractional digits beyond this are dropped
// (not rounded) to keep formatting deterministic.
const MAX_DISPLAY_FRACTION_DIGITS = 8;

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
 * Collapse atomic tx-pairs emitted by the Aave adapter so a single user action
 * doesn't surface as two Activity rows.
 *
 * Only these specific type pairs — scoped to the same (txHash, vaultId) — are
 * collapsed; everything else passes through unchanged. Multi-reserve borrow or
 * repay in the same tx share `vaultId: null` and different `debtReserveId`s,
 * so they survive.
 */
function dedupPairedActivities(
  activities: GraphQLVaultActivityItem[],
): GraphQLVaultActivityItem[] {
  const groups = new Map<string, GraphQLVaultActivityItem[]>();
  for (const activity of activities) {
    const key = `${activity.transactionHash}-${activity.vaultId ?? "nil"}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(activity);
    } else {
      groups.set(key, [activity]);
    }
  }

  const dropIds = new Set<string>();
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;

    // Count occurrences per type so we can bail out of dedup for buckets that
    // contain duplicate-type rows (e.g., two `deposit` rows in the same
    // tx+vault with different logIndex). The indexer doesn't currently emit
    // duplicates, but collapsing a bucket where they exist would silently
    // discard one of them — skip dedup and surface both rows instead.
    const typeCounts = new Map<GraphQLActivityType, number>();
    for (const a of bucket) {
      typeCounts.set(a.type, (typeCounts.get(a.type) ?? 0) + 1);
    }
    const hasDuplicateTypes = Array.from(typeCounts.values()).some(
      (n) => n > 1,
    );
    if (hasDuplicateTypes) continue;

    const typeToActivity = new Map<
      GraphQLActivityType,
      GraphQLVaultActivityItem
    >();
    for (const a of bucket) typeToActivity.set(a.type, a);

    const maybeDrop = (type: GraphQLActivityType) => {
      const dropped = typeToActivity.get(type);
      if (dropped) dropIds.add(dropped.id);
    };

    // deposit + add_collateral → drop add_collateral, keep deposit
    if (typeToActivity.has("deposit") && typeToActivity.has("add_collateral")) {
      maybeDrop("add_collateral");
    }
    // remove_collateral + redeem → drop remove_collateral, keep redeem
    if (
      typeToActivity.has("remove_collateral") &&
      typeToActivity.has("redeem")
    ) {
      maybeDrop("remove_collateral");
    }
    // liquidation + redeem → drop redeem, keep liquidation (defense-in-depth:
    // the indexer already gates on vault.status === LIQUIDATED)
    if (typeToActivity.has("liquidation") && typeToActivity.has("redeem")) {
      maybeDrop("redeem");
    }
  }

  return activities.filter((a) => !dropIds.has(a.id));
}

export async function fetchUserActivities(
  address: Address,
): Promise<ActivityLog[]> {
  const activitiesData =
    await graphqlClient.request<GraphQLVaultActivitiesResponse>(
      GET_USER_ACTIVITIES,
      { depositor: address.toLowerCase() },
    );

  const rawActivities = activitiesData.vaultActivitys.items;
  if (rawActivities.length === 0) return [];

  const activities = dedupPairedActivities(rawActivities);

  const vaultIds = Array.from(
    new Set(
      activities.map((a) => a.vaultId).filter((v): v is string => v != null),
    ),
  );
  const reserveIds = Array.from(
    new Set(
      activities
        .map((a) => a.debtReserveId)
        .filter((v): v is string => v != null),
    ),
  );

  // Fetch vault + reserve metadata in parallel. Reserve enrichment degrades
  // gracefully on both outcomes: a network/schema failure leaves reserveMap
  // empty (per-row fallback renders "—" + raw amount), and missing
  // underlyingToken on an individual row falls back to the reserve's own
  // decimals. One malformed row must never blank the whole Activity tab.
  const [vaultsResult, reservesResult] = await Promise.all([
    vaultIds.length > 0
      ? graphqlClient.request<GraphQLVaultsResponse>(GET_VAULTS_BY_IDS, {
          vaultIds,
        })
      : Promise.resolve<GraphQLVaultsResponse | null>(null),
    reserveIds.length > 0
      ? graphqlClient
          .request<GraphQLReservesResponse>(GET_RESERVES_BY_IDS, {
            ids: reserveIds,
          })
          .catch((error) => {
            logger.warn(
              "aaveReserves fetch failed; borrow/repay amounts will render with raw values",
              { data: { error } },
            );
            return null;
          })
      : Promise.resolve<GraphQLReservesResponse | null>(null),
  ]);

  const vaultMap = new Map<string, string>();
  if (vaultsResult) {
    for (const v of vaultsResult.vaults.items) {
      vaultMap.set(v.id, v.applicationEntryPoint);
    }
  }

  const reserveMap = new Map<string, { symbol: string; decimals: number }>();
  if (reservesResult) {
    for (const r of reservesResult.aaveReserves.items) {
      reserveMap.set(r.id, {
        symbol: r.underlyingToken?.symbol ?? "—",
        decimals: r.underlyingToken?.decimals ?? r.decimals,
      });
    }
  }

  const rows = activities.map((item): ActivityLog => {
    const isPositionScoped = item.type === "borrow" || item.type === "repay";

    let application: ActivityLog["application"];
    if (isPositionScoped) {
      // TODO: when more applications support borrow/repay, resolve via a
      // positionAccount → app mapping instead of hardcoding Aave.
      // Fall back to Unknown App metadata (rather than throwing) if the
      // Aave registration is missing — consistent with the per-row
      // graceful-degradation philosophy used elsewhere in this file.
      const meta = getApplication(AAVE_APP_ID)?.metadata;
      application = meta
        ? { id: meta.id, name: meta.name, logoUrl: meta.logoUrl }
        : {
            id: "unknown",
            name: "Unknown App",
            logoUrl: "/images/unknown-app.svg",
          };
    } else {
      const applicationEntryPoint = item.vaultId
        ? vaultMap.get(item.vaultId)
        : undefined;
      const appMetadata = applicationEntryPoint
        ? getApplicationMetadataByController(applicationEntryPoint)
        : undefined;
      application = {
        id: appMetadata?.id ?? "unknown",
        name: appMetadata?.name ?? "Unknown App",
        logoUrl: appMetadata?.logoUrl ?? "/images/unknown-app.svg",
      };
    }

    let amountValue: string;
    let amountSymbol: string;
    let amountIcon: string | undefined;
    if (isPositionScoped) {
      // Fall back gracefully for malformed / partially-indexed rows so a single
      // bad row doesn't blank the whole Activity tab.
      const reserve =
        item.debtReserveId != null
          ? reserveMap.get(item.debtReserveId)
          : undefined;
      amountValue = reserve
        ? formatAmount(item.amount, reserve.decimals)
        : item.amount;
      amountSymbol = reserve?.symbol ?? "—";
    } else {
      amountValue = formatAmount(item.amount, BTC_DECIMALS);
      amountSymbol = btcConfig.coinSymbol;
      amountIcon = btcConfig.icon;
    }

    return {
      id: item.id,
      date: new Date(parseInt(item.timestamp, 10) * 1000),
      application,
      type: mapActivityType(item.type),
      amount: {
        value: amountValue,
        symbol: amountSymbol,
        icon: amountIcon,
      },
      transactionHash: item.transactionHash,
    };
  });

  // Stable ordering for same-tx rows: (timestamp, blockNumber, logIndex) desc.
  // logIndex is parsed from the indexer-generated id so we don't need a
  // dedicated column. The GraphQL response is already sorted by timestamp
  // desc; this enforces a deterministic tiebreaker on rows sharing a timestamp.
  return rows
    .map((row, idx) => ({ row, raw: activities[idx] }))
    .sort((a, b) => {
      const tsDiff =
        parseInt(b.raw.timestamp, 10) - parseInt(a.raw.timestamp, 10);
      if (tsDiff !== 0) return tsDiff;
      const blockDiff =
        parseInt(b.raw.blockNumber, 10) - parseInt(a.raw.blockNumber, 10);
      if (blockDiff !== 0) return blockDiff;
      return parseLogIndex(b.raw.id) - parseLogIndex(a.raw.id);
    })
    .map(({ row }) => row);
}
