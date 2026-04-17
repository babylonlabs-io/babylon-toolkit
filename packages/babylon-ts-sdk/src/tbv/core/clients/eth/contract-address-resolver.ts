/**
 * Contract Address Resolver
 *
 * Resolves ProtocolParams and ApplicationRegistry contract addresses
 * from the BTCVaultRegistry contract. These addresses are needed to
 * construct the SDK's contract readers.
 *
 * @module clients/eth/contract-address-resolver
 */

import type { Address, PublicClient } from "viem";

import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";

export interface ProtocolAddresses {
  /** Address of the ProtocolParams contract */
  protocolParams: Address;
  /** Address of the ApplicationRegistry contract */
  applicationRegistry: Address;
}

/**
 * Resolve ProtocolParams and ApplicationRegistry addresses from BTCVaultRegistry.
 *
 * Uses a single multicall for atomicity and efficiency.
 *
 * @param publicClient - viem PublicClient instance
 * @param btcVaultRegistryAddress - Address of the BTCVaultRegistry contract
 * @returns Resolved contract addresses
 */
export async function resolveProtocolAddresses(
  publicClient: PublicClient,
  btcVaultRegistryAddress: Address,
): Promise<ProtocolAddresses> {
  const [protocolParams, applicationRegistry] = await publicClient.multicall({
    contracts: [
      {
        address: btcVaultRegistryAddress,
        abi: BTCVaultRegistryABI,
        functionName: "protocolParams",
      },
      {
        address: btcVaultRegistryAddress,
        abi: BTCVaultRegistryABI,
        functionName: "applicationRegistry",
      },
    ],
    allowFailure: false,
  });

  return {
    protocolParams: protocolParams as Address,
    applicationRegistry: applicationRegistry as Address,
  };
}
