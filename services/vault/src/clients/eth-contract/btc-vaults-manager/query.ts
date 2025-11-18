// BTC Vaults Manager - Read operations (queries)

import { type Abi, type Address, type Hex } from "viem";

import { ethClient } from "../client";
import { executeMulticall } from "../multicall-helpers";

import BTCVaultsManagerABI from "./abis/BTCVaultsManager.abi.json";

/**
 * Pegin request structure
 *
 * BTCVaultStatus enum values (core status in BTCVaultsManager):
 * 0 = Pending - Request submitted, waiting for ACKs
 * 1 = Verified - All ACKs collected, ready for inclusion proof
 * 2 = Active - Inclusion proof verified, vBTC can be minted, vault is active
 * 3 = Redeemed - Vault has been redeemed (terminal state)
 */
export interface PeginRequest {
  depositor: Address;
  depositorBtcPubkey: Hex;
  unsignedBtcTx: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number; // BTCVaultStatus: 0=Pending, 1=Verified, 2=Active, 3=Redeemed
  applicationController: Address; // Application the vault is registered for (immutable, set at creation)
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
      functionName: "getDepositorPeginRequests",
      args: [depositorAddress],
    });
    return result as Hex[];
  } catch (error) {
    throw new Error(
      `Failed to get depositor pegin requests: ${error instanceof Error ? error.message : "Unknown error"}`,
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
      functionName: "btcVaults",
      args: [pegInTxHash],
    });

    // Contract returns 7 fields from BTCVault struct:
    // 1. depositor, 2. depositorBtcPubKey, 3. unsignedPegInTx, 4. amount,
    // 5. vaultProvider, 6. status, 7. applicationController
    const [
      depositor,
      depositorBtcPubkey,
      unsignedBtcTx,
      amount,
      vaultProvider,
      status,
      applicationController,
    ] = result as [
      Address, // depositor
      Hex, // depositorBtcPubKey (32 bytes, x-only format)
      Hex, // unsignedPegInTx
      bigint, // amount
      Address, // vaultProvider
      number, // status
      Address, // applicationController
    ];

    return {
      depositor,
      depositorBtcPubkey,
      unsignedBtcTx,
      amount,
      vaultProvider,
      status,
      applicationController,
    };
  } catch (error) {
    throw new Error(
      `Failed to get pegin request: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Get vault provider's BTC public key
 * @param contractAddress - BTCVaultsManager contract address
 * @param vaultProviderAddress - Vault provider's Ethereum address
 * @returns Vault provider's BTC public key (32 bytes, x-only format)
 */
export async function getProviderBTCKey(
  contractAddress: Address,
  vaultProviderAddress: Address,
): Promise<Hex> {
  try {
    const publicClient = ethClient.getPublicClient();
    const result = await publicClient.readContract({
      address: contractAddress,
      abi: BTCVaultsManagerABI,
      functionName: "providerBTCKeys",
      args: [vaultProviderAddress],
    });
    return result as Hex;
  } catch (error) {
    throw new Error(
      `Failed to get provider BTC key: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Bulk get pegin requests for multiple transaction hashes
 * Uses multicall to batch requests into a single RPC call for better performance
 *
 * Note: Filters out failed requests automatically. If you need to track which requests failed,
 * consider using the return value's length compared to input length.
 *
 * @param contractAddress - BTCVaultsManager contract address
 * @param pegInTxHashes - Array of pegin transaction hashes
 * @returns Array of pegin requests (only successful fetches, failed requests are filtered out)
 */
export async function getPeginRequestsBulk(
  contractAddress: Address,
  pegInTxHashes: Hex[],
): Promise<PeginRequest[]> {
  if (pegInTxHashes.length === 0) {
    return [];
  }

  try {
    const publicClient = ethClient.getPublicClient();

    // Use shared multicall helper
    type PeginRequestRaw = [Address, Hex, Hex, bigint, Address, number, Hex];
    const results = await executeMulticall<PeginRequestRaw>(
      publicClient,
      contractAddress,
      BTCVaultsManagerABI as Abi,
      "btcVaults",
      pegInTxHashes.map((txHash) => [txHash]),
    );

    // Transform raw results to PeginRequest format
    return results.map(
      ([
        depositor,
        depositorBtcPubkey,
        unsignedBtcTx,
        amount,
        vaultProvider,
        status,
        applicationController,
      ]) => ({
        depositor,
        depositorBtcPubkey,
        unsignedBtcTx,
        amount,
        vaultProvider,
        status,
        applicationController,
      }),
    );
  } catch (error) {
    throw new Error(
      `Failed to bulk fetch pegin requests: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
