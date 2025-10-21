// BTC Vault Controller - Read operations (queries)

import { type Address, type Hex, type Abi } from 'viem';
import { ethClient } from '../client';
import { executeMulticall } from '../multicall-helpers';
import BTCVaultControllerABI from './abis/BTCVaultController.abi.json';

/**
 * Depositor structure from contract
 */
interface DepositorStruct {
  ethAddress: Address;
  btcPubKey: Hex;
}

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
      result as [DepositorStruct, Address, Hex, bigint, bigint, boolean];

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
 * Note: Filters out failed requests automatically. If you need to track which requests failed,
 * consider using the return value's length compared to input length.
 *
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHashes - Array of pegin transaction hashes
 * @returns Array of vault metadata (only successful fetches, failed requests are filtered out)
 */
export async function getVaultMetadataBulk(
  contractAddress: Address,
  pegInTxHashes: Hex[]
): Promise<VaultMetadata[]> {
  if (pegInTxHashes.length === 0) {
    return [];
  }

  try {
    const publicClient = ethClient.getPublicClient();

    // Use shared multicall helper
    type VaultMetadataRaw = [DepositorStruct, Address, Hex, bigint, bigint, boolean];
    const results = await executeMulticall<VaultMetadataRaw>(
      publicClient,
      contractAddress,
      BTCVaultControllerABI as Abi,
      'vaultMetadata',
      pegInTxHashes.map(txHash => [txHash])
    );

    // Transform raw results to VaultMetadata format
    return results.map(([depositor, proxyContract, marketId, vBTCAmount, borrowAmount, active]) => ({
      depositor: {
        ethAddress: depositor.ethAddress as Address,
        btcPubKey: depositor.btcPubKey as Hex,
      },
      proxyContract,
      marketId,
      vBTCAmount,
      borrowAmount,
      active,
    }));
  } catch (error) {
    throw new Error(
      `Failed to bulk fetch vault metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
