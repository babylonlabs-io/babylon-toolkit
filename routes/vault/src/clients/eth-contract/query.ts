// ETH smart contract client for read operations (queries)

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
  type Hex,
} from 'viem';

import { getNetworkConfigETH } from '../../config/network';
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
 * ETHQueryClient - Singleton client for reading from Ethereum smart contracts
 * Uses public client for read-only operations
 */
class ETHQueryClient {
  private static instance: ETHQueryClient;
  private publicClient: PublicClient;
  private config = getNetworkConfigETH();

  private constructor() {
    // Create public client with config from environment
    this.publicClient = createPublicClient({
      chain: this.config.chain,
      transport: http(this.config.rpcUrl),
    });
  }

  /**
   * Get singleton instance of ETHQueryClient
   */
  static getInstance(): ETHQueryClient {
    if (!ETHQueryClient.instance) {
      ETHQueryClient.instance = new ETHQueryClient();
    }
    return ETHQueryClient.instance;
  }

  /**
   * Get the public client for read operations
   */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  // ===== BTC Vault Controller Query Functions =====

  /**
   * Get all pegin transaction hashes for a user
   * @param contractAddress - BTCVaultController contract address
   * @param userAddress - User's Ethereum address
   * @returns Array of pegin transaction hashes (bytes32)
   */
  async getUserVaults(contractAddress: Address, userAddress: Address): Promise<Hex[]> {
    try {
      const result = await this.publicClient.readContract({
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
  async getVaultMetadata(
    contractAddress: Address,
    pegInTxHash: Hex
  ): Promise<VaultMetadata> {
    try {
      const result = await this.publicClient.readContract({
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
   * Get all pegin request hashes for a depositor
   * @param contractAddress - BTCVaultController contract address
   * @param depositorAddress - Depositor's Ethereum address
   * @returns Array of pegin transaction hashes
   */
  async getDepositorPeginRequests(
    contractAddress: Address,
    depositorAddress: Address
  ): Promise<Hex[]> {
    try {
      const result = await this.publicClient.readContract({
        address: contractAddress,
        abi: BTCVaultControllerABI,
        functionName: 'getDepositorPeginRequests',
        args: [depositorAddress],
      });
      return result as Hex[];
    } catch (error) {
      throw new Error(
        `Failed to get depositor pegin requests: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get details of a specific pegin request
   * @param contractAddress - BTCVaultController contract address
   * @param pegInTxHash - Pegin transaction hash
   * @returns Pegin request details
   */
  async getPeginRequest(
    contractAddress: Address,
    pegInTxHash: Hex
  ): Promise<PeginRequest> {
    try {
      const result = await this.publicClient.readContract({
        address: contractAddress,
        abi: BTCVaultControllerABI,
        functionName: 'getPeginRequest',
        args: [pegInTxHash],
      });

      const [depositor, txHash, amount, status] = result as [
        Address,
        Hex,
        bigint,
        number
      ];

      return {
        depositor,
        txHash,
        amount,
        status,
      };
    } catch (error) {
      throw new Error(
        `Failed to get pegin request: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if a pegin is verified
   * @param contractAddress - BTCVaultController contract address
   * @param pegInTxHash - Pegin transaction hash
   * @returns True if pegin is verified
   */
  async isPeginVerified(contractAddress: Address, pegInTxHash: Hex): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: contractAddress,
        abi: BTCVaultControllerABI,
        functionName: 'isPeginVerified',
        args: [pegInTxHash],
      });
      return result as boolean;
    } catch (error) {
      throw new Error(
        `Failed to check if pegin is verified: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if pegin assets are already minted
   * @param contractAddress - BTCVaultController contract address
   * @param pegInTxHash - Pegin transaction hash
   * @returns True if assets are minted
   */
  async arePeginAssetsMinted(
    contractAddress: Address,
    pegInTxHash: Hex
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
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
  async isPeginReadyToMint(
    contractAddress: Address,
    pegInTxHash: Hex
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
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
}

// Export singleton instance
export const ethQueryClient = ETHQueryClient.getInstance();
