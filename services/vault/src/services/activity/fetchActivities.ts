import { gql } from "graphql-request";
import type { Address } from "viem";
import { formatUnits } from "viem";

import { getApplicationMetadataByController } from "../../applications";
import { graphqlClient } from "../../clients/graphql";
import { getNetworkConfigBTC } from "../../config";
import type {
  ActivityChain,
  ActivityLog,
  ActivityType,
} from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

const BTC_DECIMALS = 8;

type GraphQLActivityType =
  | "deposit"
  | "withdrawal"
  | "add_collateral"
  | "remove_collateral"
  | "liquidation";

interface GraphQLVaultActivityItem {
  id: string;
  vaultId: string;
  depositor: string;
  type: GraphQLActivityType;
  amount: string;
  timestamp: string;
  blockNumber: string;
  transactionHash: string;
  vault: {
    peginTxHash: string;
  } | null;
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
        timestamp
        blockNumber
        transactionHash
        vault {
          peginTxHash
        }
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
  };
  const mapped = typeMap[type];
  if (!mapped) {
    throw new Error(`Unknown activity type from GraphQL API: ${type}`);
  }
  return mapped;
}

/**
 * Decide which hash + chain to surface in the "Transaction Hash" column.
 * For peg-in deposits we prefer the BTC pegin txid (matches how the rest of the
 * dApp identifies a deposit). For all other activity types the meaningful tx is
 * the EVM event that triggered the indexer record.
 */
function resolveDisplayTx(item: GraphQLVaultActivityItem): {
  chain: ActivityChain;
  transactionHash: string;
} {
  if (BTC_PRIMARY_ACTIVITIES.has(item.type) && item.vault?.peginTxHash) {
    return { chain: "BTC", transactionHash: item.vault.peginTxHash };
  }
  return { chain: "ETH", transactionHash: item.transactionHash };
}

function formatAmount(amount: string): string {
  const formatted = formatUnits(BigInt(amount), BTC_DECIMALS);
  const num = parseFloat(formatted);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: BTC_DECIMALS,
  });
}

export async function fetchUserActivities(
  address: Address,
): Promise<ActivityLog[]> {
  const activitiesData =
    await graphqlClient.request<GraphQLVaultActivitiesResponse>(
      GET_USER_ACTIVITIES,
      { depositor: address.toLowerCase() },
    );

  const activities = activitiesData.vaultActivitys.items;
  if (activities.length === 0) return [];

  const vaultIds = Array.from(new Set(activities.map((a) => a.vaultId)));
  const vaultsData = await graphqlClient.request<GraphQLVaultsResponse>(
    GET_VAULTS_BY_IDS,
    { vaultIds },
  );

  const vaultMap = new Map(
    vaultsData.vaults.items.map((v) => [v.id, v.applicationEntryPoint]),
  );

  return activities.map((item) => {
    const applicationEntryPoint = vaultMap.get(item.vaultId);
    const appMetadata = applicationEntryPoint
      ? getApplicationMetadataByController(applicationEntryPoint)
      : undefined;

    const { chain, transactionHash } = resolveDisplayTx(item);

    return {
      id: item.id,
      date: new Date(parseInt(item.timestamp, 10) * 1000),
      application: {
        id: appMetadata?.id ?? "unknown",
        name: appMetadata?.name ?? "Unknown App",
        logoUrl: appMetadata?.logoUrl ?? "/images/unknown-app.svg",
      },
      type: mapActivityType(item.type),
      amount: {
        value: formatAmount(item.amount),
        symbol: btcConfig.coinSymbol,
        icon: btcConfig.icon,
      },
      chain,
      transactionHash,
    };
  });
}
