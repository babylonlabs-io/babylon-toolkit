// Shared ETH client singleton for all contract interactions

import { createPublicClient, http, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';

/**
 * ETHClient - Singleton client for Ethereum interactions
 * Provides a shared public client configured with the network settings
 */
class ETHClient {
  private static instance: ETHClient;
  private publicClient: PublicClient;

  private constructor() {
    // For now, hardcoded to Sepolia
    // TODO: Make this configurable based on environment
    const rpcUrl = process.env.NEXT_PUBLIC_ETH_RPC_URL || sepolia.rpcUrls.default.http[0];
    
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
  }

  /**
   * Get singleton instance of ETHClient
   */
  static getInstance(): ETHClient {
    if (!ETHClient.instance) {
      ETHClient.instance = new ETHClient();
    }
    return ETHClient.instance;
  }

  /**
   * Get the public client for read operations
   */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }
}

// Export singleton instance
export const ethClient = ETHClient.getInstance();

