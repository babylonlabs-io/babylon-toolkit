// BTC Vault Controller - Read operations (queries)

import { type Address, type Hex } from 'viem';
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
 * Pegin request structure
 */
export interface PeginRequest {
  depositor: Address;
  txHash: Hex;
  amount: bigint;
  status: number; // 0 = Pending, 1 = Verified, 2 = Active
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
 * Check if pegin assets are already minted
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash
 * @returns True if assets are minted
 */
export async function arePeginAssetsMinted(
  contractAddress: Address,
  pegInTxHash: Hex
): Promise<boolean> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'arePeginAssetsMinted',
      args: [pegInTxHash],
    });
    return result as boolean;
  } catch (error) {
    throw new Error(
      `Failed to check if pegin assets are minted: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if pegin is ready to mint
 * @param contractAddress - BTCVaultController contract address
 * @param pegInTxHash - Pegin transaction hash
 * @returns True if pegin is ready to mint
 */
export async function isPeginReadyToMint(
  contractAddress: Address,
  pegInTxHash: Hex
): Promise<boolean> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultControllerABI,
      functionName: 'isPeginReadyToMint',
      args: [pegInTxHash],
    });
    return result as boolean;
  } catch (error) {
    throw new Error(
      `Failed to check if pegin is ready to mint: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
