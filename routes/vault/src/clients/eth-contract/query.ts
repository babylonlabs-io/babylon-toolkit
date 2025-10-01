// ETH smart contract client for read operations (queries)

import {
  createPublicClient,
  http,
  type Address,
  type PublicClient,
} from 'viem';

import { getNetworkConfigETH } from '../../config/network';

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

  /**
   * Get the network config
   */
  getConfig() {
    return this.config;
  }

  /**
   * Example: Query an ERC20 token balance for an address
   * @param contractAddress - The ERC20 token contract address
   * @param accountAddress - The address to check balance for
   * @returns Formatted balance string with symbol (e.g., "100.5 USDC")
   */
  async queryERC20Balance(
    contractAddress: Address,
    accountAddress: Address
  ): Promise<string> {
    const erc20Abi = [
      {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: 'balance', type: 'uint256' }],
      },
      {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
      },
      {
        name: 'symbol',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'string' }],
      },
    ] as const;

    try {
      const [balance, decimals, symbol] = await Promise.all([
        this.publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [accountAddress],
        }),
        this.publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
        this.publicClient.readContract({
          address: contractAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
      ]);

      const formattedBalance = (Number(balance) / 10 ** decimals).toFixed(decimals);
      return `${formattedBalance} ${symbol}`;
    } catch (error) {
      throw new Error(
        `Failed to query ERC20 balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// Export singleton instance
export const ethQueryClient = ETHQueryClient.getInstance();
