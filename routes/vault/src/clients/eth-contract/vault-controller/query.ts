// BTC Vault Controller - Read operations (queries)

import { type Address, type Hex, type Abi } from 'viem';
import { ethClient } from '../client';
import BTCVaultControllerABI from './abis/BTCVaultController.abi.json';

/**
 * Vault metadata structure
 */
export interface VaultMetadata {
  depositor: {
    ethAddress: Address;
    btcPubKey: Hex;
  };
  proxyContract: Address;
  marketId: Hex;
  vBTCAmount: bigint;
  borrowAmount: bigint;
  active: boolean;
}

/**
 * Get all pegin transaction hashes for a user
 * @param contractAddress - BTCVaultController contract address
 * @param userAddress - User's Ethereum address
 * @returns Array of pegin transaction hashes (bytes32)
 */
export async function getUserVaults(
  contractAddress: Address,
  userAddress: Address
): Promise<Hex[]> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'getUserVaults',
      args: [userAddress],
    });
    return result as Hex[];
  } catch (error) {
    throw new Error(
      `Failed to get user vaults: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get metadata for a specific vault
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash (bytes32)
 * @returns Vault metadata
 */
export async function getVaultMetadata(
  contractAddress: Address,
  pegInTxHash: Hex
): Promise<VaultMetadata> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'vaultMetadata',
      args: [pegInTxHash],
    });

    const [depositor, proxyContract, marketId, vBTCAmount, borrowAmount, active] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result as [any, Address, Hex, bigint, bigint, boolean];

    return {
      depositor: {
        ethAddress: depositor.ethAddress as Address,
        btcPubKey: depositor.btcPubKey as Hex,
      },
      proxyContract,
      marketId,
      vBTCAmount,
      borrowAmount,
      active,
    };
  } catch (error) {
    throw new Error(
      `Failed to get vault metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}


/**
 * Bulk get vault metadata for multiple pegin transaction hashes
 * Uses multicall to batch requests into a single RPC call for better performance
 *
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes
 * @returns Array of vault metadata or undefined for vaults that don't exist/aren't minted
 */
export async function getVaultMetadataBulk(
  contractAddress: Address,
  pegInTxHashes: Hex[]
): Promise<(VaultMetadata | undefined)[]> {
  if (pegInTxHashes.length === 0) {
    return [];
  }

  try {
    const publicClient = ethClient.getPublicClient();

    // Create multicall contract calls
    const contracts = pegInTxHashes.map(txHash => ({
      address: contractAddress,
      abi: BTCVaultControllerABI as Abi,
      functionName: 'vaultMetadata' as const,
      args: [txHash],
    }));

    // Execute all calls in a single multicall request
    const results = await publicClient.multicall({
      contracts,
      allowFailure: true, // Allow individual calls to fail without breaking the batch
    });

    // Transform results
    return results.map((result) => {
      if (result.status === 'failure') {
        // Vault not minted yet or error fetching metadata
        return undefined;
      }

      const [depositor, proxyContract, marketId, vBTCAmount, borrowAmount, active] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.result as [any, Address, Hex, bigint, bigint, boolean];

      return {
        depositor: {
          ethAddress: depositor.ethAddress as Address,
          btcPubKey: depositor.btcPubKey as Hex,
        },
        proxyContract,
        marketId,
        vBTCAmount,
        borrowAmount,
        active,
      };
    });
  } catch (error) {
    throw new Error(
      `Failed to bulk fetch vault metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
