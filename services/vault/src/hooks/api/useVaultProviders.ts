import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/client";

export const VAULT_PROVIDERS_KEY = "vaultProviders";

const GET_VAULT_PROVIDERS = gql`
  query GetVaultProviders {
    vaultProviders {
      items {
        id
        btcPubKey
        applicationController
        depositAmount
        status
        registeredAt
        activatedAt
        blockNumber
        transactionHash
      }
    }
  }
`;

interface VaultProvidersResponse {
  vaultProviders: {
    items: Array<{
      id: string;
      btcPubKey: string;
      applicationController: string;
      depositAmount: string;
      status: string;
      registeredAt: string;
      activatedAt: string | null;
      blockNumber: string;
      transactionHash: string;
    }>;
  };
}

export const useVaultProvidersQuery = () => {
  return useQuery({
    queryKey: [VAULT_PROVIDERS_KEY],
    queryFn: async () => {
      const data =
        await graphqlClient.request<VaultProvidersResponse>(
          GET_VAULT_PROVIDERS,
        );
      return data.vaultProviders.items.map((provider) => ({
        id: provider.id,
        btc_pub_key: provider.btcPubKey,
        application_controller: provider.applicationController,
        deposit_amount: provider.depositAmount,
        status: provider.status,
        registered_at: provider.registeredAt,
        activated_at: provider.activatedAt,
        block_number: provider.blockNumber,
        transaction_hash: provider.transactionHash,
      }));
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
};
