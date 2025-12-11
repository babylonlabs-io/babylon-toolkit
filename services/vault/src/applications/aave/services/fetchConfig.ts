/**
 * Aave Config Service
 *
 * Fetches Aave configuration (contract addresses, reserve IDs) from the GraphQL indexer.
 * This is a singleton configuration that should be fetched once and cached.
 */

import { gql } from "graphql-request";

import { graphqlClient } from "../../../clients/graphql";

/**
 * Aave configuration from GraphQL indexer
 * Contains contract addresses and reserve IDs discovered from the AaveIntegrationController
 */
export interface AaveConfig {
  /** AaveIntegrationController contract address */
  controllerAddress: string;
  /** VaultBTC token address */
  vaultBtcAddress: string;
  /** BTCVaultsManager contract address */
  btcVaultManagerAddress: string;
  /** Core Spoke contract address (for user lending positions) */
  btcVaultCoreSpokeAddress: string;
  /** Core Spoke proxy implementation address */
  btcVaultCoreSpokeProxyImplementation: string;
  /** vBTC reserve ID on Core Spoke */
  btcVaultCoreVbtcReserveId: bigint;
}

/** GraphQL response shape */
interface GraphQLAaveConfigResponse {
  aaveConfig: {
    id: number;
    controllerAddress: string;
    vaultBtcAddress: string;
    btcVaultManagerAddress: string;
    btcVaultCoreSpokeAddress: string;
    btcVaultCoreSpokeProxyImplementation: string;
    btcVaultCoreVbtcReserveId: string;
  } | null;
}

const GET_AAVE_CONFIG = gql`
  query GetAaveConfig {
    aaveConfig(id: 1) {
      id
      controllerAddress
      vaultBtcAddress
      btcVaultManagerAddress
      btcVaultCoreSpokeAddress
      btcVaultCoreSpokeProxyImplementation
      btcVaultCoreVbtcReserveId
    }
  }
`;

/**
 * Fetches Aave configuration from the GraphQL indexer.
 *
 * The configuration is a singleton (id: 1) that contains contract addresses
 * and reserve IDs discovered from the AaveIntegrationController at indexer startup.
 *
 * @returns Aave configuration or null if not found
 * @throws Error if the GraphQL request fails
 */
export async function fetchAaveConfig(): Promise<AaveConfig | null> {
  const response =
    await graphqlClient.request<GraphQLAaveConfigResponse>(GET_AAVE_CONFIG);

  if (!response.aaveConfig) {
    return null;
  }

  return {
    controllerAddress: response.aaveConfig.controllerAddress,
    vaultBtcAddress: response.aaveConfig.vaultBtcAddress,
    btcVaultManagerAddress: response.aaveConfig.btcVaultManagerAddress,
    btcVaultCoreSpokeAddress: response.aaveConfig.btcVaultCoreSpokeAddress,
    btcVaultCoreSpokeProxyImplementation:
      response.aaveConfig.btcVaultCoreSpokeProxyImplementation,
    btcVaultCoreVbtcReserveId: BigInt(
      response.aaveConfig.btcVaultCoreVbtcReserveId,
    ),
  };
}
