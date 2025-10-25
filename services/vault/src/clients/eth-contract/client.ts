// Shared ETH client singleton for all contract interactions

import { createPublicClient, http, type PublicClient } from 'viem';
import { getNetworkConfigETH, getETHChain } from '@babylonlabs-io/config';

/**
 * ETHClient - Singleton client for Ethereum interactions
 * Provides a shared public client configured with the network settings
 */
class ETHClient {
  private static instance: ETHClient;
  private publicClient: PublicClient;
  private config = getNetworkConfigETH();

  private constructor() {
    // Create public client with config from environment
    this.publicClient = createPublicClient({
      chain: getETHChain(),
      transport: http(this.config.rpcUrl),
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
