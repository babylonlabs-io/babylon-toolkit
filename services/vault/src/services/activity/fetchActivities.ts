import { gql } from "graphql-request";
import type { Address } from "viem";
import { formatUnits } from "viem";

import { getApplicationMetadataByController } from "../../applications";
import { graphqlClient } from "../../clients/graphql";
import { getNetworkConfigBTC } from "../../config";
import type { ActivityLog, ActivityType } from "../../types/activityLog";

const btcConfig = getNetworkConfigBTC();

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
}

interface GraphQLVaultActivitiesResponse {
  vaultActivitys: {
    items: GraphQLVaultActivityItem[];
  };
}

interface GraphQLVaultItem {
  id: string;
  applicationController: string;
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
      }
    }
  }
`;

const GET_VAULTS_BY_IDS = gql`
  query GetVaultsByIds($vaultIds: [String!]!) {
    vaults(where: { id_in: $vaultIds }) {
      items {
        id
        applicationController
      }
    }
  }
`;

function mapActivityType(type: GraphQLActivityType): ActivityType | null {
  const typeMap: Partial<Record<GraphQLActivityType, ActivityType>> = {
    deposit: "Deposit",
    withdrawal: "Withdraw",
    add_collateral: "Deposit",
    remove_collateral: "Withdraw",
  };
  return typeMap[type] ?? null;
}

function formatAmount(amount: string): string {
  const formatted = formatUnits(BigInt(amount), 8);
  const num = parseFloat(formatted);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
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
    vaultsData.vaults.items.map((v) => [v.id, v.applicationController]),
  );

  return activities
    .map((item) => {
      const activityType = mapActivityType(item.type);
      if (!activityType) return null;

      const applicationController = vaultMap.get(item.vaultId);
      const appMetadata = applicationController
        ? getApplicationMetadataByController(applicationController)
        : undefined;

      return {
        id: item.id,
        date: new Date(parseInt(item.timestamp, 10) * 1000),
        application: {
          id: appMetadata?.id ?? "unknown",
          name: appMetadata?.name ?? "Unknown App",
          logoUrl: appMetadata?.logoUrl ?? "/images/unknown-app.svg",
        },
        type: activityType,
        amount: {
          value: formatAmount(item.amount),
          symbol: btcConfig.coinSymbol,
          icon: btcConfig.icon,
        },
        transactionHash: item.transactionHash,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
