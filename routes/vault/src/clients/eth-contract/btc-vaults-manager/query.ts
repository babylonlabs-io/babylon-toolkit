// BTC Vaults Manager - Read operations (queries)

import { type Address, type Hex } from 'viem';
import { ethClient } from '../client';
import BTCVaultsManagerABI from './abis/BTCVaultsManager.abi.json';

/**
 * Pegin request structure
 */
export interface PeginRequest {
  depositor: Address;
  unsignedBtcTx: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number; // 0 = Pending, 1 = Verified, 2 = Active
}

/**
 * Get all pegin request hashes for a depositor
 * @param contractAddress - BTCVaultsManager contract address
 * @param depositorAddress - Depositor's Ethereum address
 * @returns Array of pegin transaction hashes
 */
export async function getDepositorPeginRequests(
  contractAddress: Address,
  depositorAddress: Address,
): Promise<Hex[]> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultsManagerABI,
      functionName: 'getDepositorPeginRequests',
      args: [depositorAddress],
    });
    return result as Hex[];
  } catch (error) {
    throw new Error(
      `Failed to get depositor pegin requests: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Get details of a specific pegin request
 * Uses the `btcVaults` mapping which includes vaultProvider
 * @param contractAddress - BTCVaultsManager contract address
 * @param pegInTxHash - Pegin transaction hash
 * @returns Pegin request details including vaultProvider
 */
export async function getPeginRequest(
  contractAddress: Address,
  pegInTxHash: Hex,
): Promise<PeginRequest> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultsManagerABI,
      functionName: 'btcVaults',
      args: [pegInTxHash],
    });

    // Contract returns 7 fields from BTCVault struct (excluding mapping):
    // 1. depositor, 2. depositorBtcPubKey, 3. unsignedPegInTx, 4. amount,
    // 5. vaultProvider, 6. status, 7. positionId
    const [
      depositor,
      _depositorBtcPubKey,
      unsignedBtcTx,
      amount,
      vaultProvider,
      status,
      _positionId,
    ] = result as [
      Address, // depositor
      Hex, // depositorBtcPubKey (32 bytes)
      Hex, // unsignedPegInTx
      bigint, // amount
      Address, // vaultProvider
      number, // status
      Hex, // positionId
    ];

    return {
      depositor,
      unsignedBtcTx,
      amount,
      vaultProvider,
      status,
      // Note: depositorBtcPubKey and positionId are read but not included in return
      // since PeginRequest interface doesn't need them for now
    };
  } catch (error) {
    throw new Error(
      `Failed to get pegin request: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Check if a pegin is verified
 * @param contractAddress - BTCVaultsManager contract address
 * @param pegInTxHash - Pegin transaction hash
 * @returns True if pegin is verified
 */
export async function isPeginVerified(
  contractAddress: Address,
  pegInTxHash: Hex,
): Promise<boolean> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultsManagerABI,
      functionName: 'isPeginVerified',
      args: [pegInTxHash],
    });
    return result as boolean;
  } catch (error) {
    throw new Error(
      `Failed to check if pegin is verified: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Check if an address is a registered liquidator
 * @param contractAddress - BTCVaultsManager contract address
 * @param liquidatorAddress - Address to check
 * @returns True if address is a liquidator
 */
export async function isLiquidator(
  contractAddress: Address,
  liquidatorAddress: Address,
): Promise<boolean> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultsManagerABI,
      functionName: 'isLiquidator',
      args: [liquidatorAddress],
    });
    return result as boolean;
  } catch (error) {
    throw new Error(
      `Failed to check if liquidator: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
