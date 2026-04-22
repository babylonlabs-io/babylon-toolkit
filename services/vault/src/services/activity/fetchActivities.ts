import { gql } from "graphql-request";
import type { Address } from "viem";
import { formatUnits } from "viem";

import { graphqlClient } from "../../clients/graphql";
import { getNetworkConfigBTC } from "../../config";
import type {
  ActivityApplication,
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
  vault: {
    peginTxHash: string;
  } | null;
}

interface GraphQLVaultItem {
  id: string;
  applicationEntryPoint: string;
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
 * trip, the vault rows referenced by those activities for application
 * metadata enrichment. The frontend joins on `vault.id` client-side.
 *
 * We pass the depositor as a String into both queries: vaultActivitys uses it
 * directly, and vaults reuses it as a depositor filter so the indexer only
 * returns vault rows the user could conceivably reference. Borrow/repay rows
 * (vaultId = null) carry no vault join — their app metadata comes from the
 * caller-injected dependency map.
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
        vault {
          peginTxHash
        }
      }
    }
    vaults(where: { depositor: $depositor }) {
      items {
        id
        applicationEntryPoint
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
function resolveDisplayTx(item: GraphQLVaultActivityItem): {
  chain: ActivityChain;
  transactionHash: string;
} {
  if (BTC_PRIMARY_ACTIVITIES.has(item.type)) {
    const peginTxHash = item.vault?.peginTxHash;
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

const UNKNOWN_APP: ActivityApplication = {
  id: "unknown",
  name: "Unknown App",
  logoUrl: "/images/unknown-app.svg",
};

/**
 * Caller-injected dependencies. The hook layer reads these from the AaveConfig
 * context provider (which already loads them once at app startup), keeping
 * this service free of global registry / network dependencies for non-
 * activity data.
 */
export interface FetchUserActivitiesDeps {
  /** Map of debtReserveId -> { symbol, decimals }, e.g. from `useAaveConfig().borrowableReserves`. */
  reserves: ReadonlyMap<string, { symbol: string; decimals: number }>;
  /** Application metadata used for borrow/repay rows (currently always Aave). */
  borrowAppMetadata: ActivityApplication;
  /** Resolve vault-scoped application metadata by entry-point controller address. */
  resolveVaultApp: (
    controllerAddress: string,
  ) => ActivityApplication | undefined;
}

export async function fetchUserActivities(
  address: Address,
  deps: FetchUserActivitiesDeps,
): Promise<ActivityLog[]> {
  const data = await graphqlClient.request<GraphQLActivityPageResponse>(
    GET_ACTIVITIES_PAGE,
    { depositor: address.toLowerCase() },
  );

  const activities = data.vaultActivitys.items;
  if (activities.length === 0) return [];

  const vaultMap = new Map<string, string>();
  for (const v of data.vaults.items) {
    vaultMap.set(v.id, v.applicationEntryPoint);
  }

  const rows = activities.map((item): ActivityLog => {
    const isPositionScoped = item.type === "borrow" || item.type === "repay";

    let application: ActivityApplication;
    if (isPositionScoped) {
      // TODO: when more applications support borrow/repay, resolve via a
      // positionAccount → app mapping instead of a single injected metadata.
      application = deps.borrowAppMetadata;
    } else {
      const applicationEntryPoint = item.vaultId
        ? vaultMap.get(item.vaultId)
        : undefined;
      application = applicationEntryPoint
        ? (deps.resolveVaultApp(applicationEntryPoint) ?? UNKNOWN_APP)
        : UNKNOWN_APP;
    }

    let amountValue: string;
    let amountSymbol: string;
    let amountIcon: string | undefined;
    if (isPositionScoped) {
      // Fall back gracefully for malformed / partially-indexed rows so a single
      // bad row doesn't blank the whole Activity tab.
      const reserve =
        item.debtReserveId != null
          ? deps.reserves.get(item.debtReserveId)
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

    const { chain, transactionHash } = resolveDisplayTx(item);

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
      chain,
      transactionHash,
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
