import { useQuery } from "@tanstack/react-query";
import { gql } from "graphql-request";

import { graphqlClient } from "../../clients/graphql/config";
import type { MorphoMarket } from "../../types/api";

export const MARKETS_KEY = "markets";

const GET_MARKETS = gql`
  query GetMarkets {
    markets {
      items {
        id
        loanTokenAddress
        collateralTokenAddress
        oracleAddress
        irm
        lltv
        createdAt
        blockNumber
        transactionHash
      }
    }
  }
`;

interface MarketsResponse {
  markets: {
    items: Array<{
      id: string;
      loanTokenAddress: string;
      collateralTokenAddress: string;
      oracleAddress: string;
      irm: string;
      lltv: string;
      createdAt: string;
      blockNumber: string;
      transactionHash: string;
    }>;
  };
}

export const useMarketsQuery = () => {
  return useQuery({
    queryKey: [MARKETS_KEY],
    queryFn: async () => {
      const data = await graphqlClient.request<MarketsResponse>(GET_MARKETS);
      return data.markets.items.map((market) => ({
        id: market.id,
        loan_token: market.loanTokenAddress,
        collateral_token: market.collateralTokenAddress,
        oracle: market.oracleAddress,
        irm: market.irm,
        lltv: market.lltv,
        created_block: parseInt(market.blockNumber),
        created_tx_hash: market.transactionHash,
      })) as MorphoMarket[];
    },
    retry: 2,
    staleTime: 60000,
  });
};

