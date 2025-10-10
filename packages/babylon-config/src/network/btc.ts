/**
 * Bitcoin Network Configuration
 *
 * Provides network configuration for Bitcoin based on the environment.
 * Uses the same NEXT_PUBLIC_NETWORK env var as ETH config for consistency.
 *
 * Standard Bitcoin network types:
 * - "mainnet" for Bitcoin mainnet
 * - "testnet" for Bitcoin testnet
 * - "signet" for Bitcoin signet
 * - "regtest" for local development
 */

export type BTCNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';

interface BTCNetworkConfig {
  network: BTCNetwork;
  name: string;
}

const defaultNetwork = "testnet";
// Internal network variable - do not export to avoid conflicts
const network = process.env.NEXT_PUBLIC_NETWORK ?? defaultNetwork;

const config: Record<string, BTCNetworkConfig> = {
  mainnet: {
    network: 'mainnet',
    name: 'Bitcoin Mainnet',
  },
  canary: {
    network: 'mainnet',
    name: 'Bitcoin Mainnet',
  },
  testnet: {
    network: 'signet',
    name: 'Bitcoin Signet',
  },
  devnet: {
    network: 'signet',
    name: 'Bitcoin Signet',
  },
  localhost: {
    network: 'regtest',
    name: 'Bitcoin Regtest',
  },
};

/**
 * Get BTC network configuration based on environment
 * @returns BTC network config for the current environment
 */
export function getNetworkConfigBTC(): BTCNetworkConfig {
  return config[network] ?? config[defaultNetwork];
}

/**
 * Get the BTC network type for the current environment
 * This is a convenience function that returns just the network string.
 * @returns 'mainnet' | 'testnet' | 'signet' | 'regtest'
 */
export function getBTCNetwork(): BTCNetwork {
  return getNetworkConfigBTC().network;
}
