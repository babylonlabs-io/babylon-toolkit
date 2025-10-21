/**
 * Peg-in Configuration
 *
 * Configuration for BTC peg-in transactions.
 * Network and liquidator data is now fetched from the vault-indexer API.
 */

/**
 * WASM network format (different from standard Bitcoin network names)
 */
export type WASMNetwork = 'bitcoin' | 'testnet' | 'regtest' | 'signet';

/**
 * Get BTC network in WASM-friendly format based on environment
 */
export function getBTCNetworkForWASM(): WASMNetwork {
  const network = process.env.NEXT_PUBLIC_BTC_NETWORK || 'signet';
  
  // Map standard network names to WASM format
  switch (network.toLowerCase()) {
    case 'mainnet':
    case 'bitcoin':
      return 'bitcoin';
    case 'testnet':
    case 'testnet3':
      return 'testnet';
    case 'regtest':
    case 'local':
      return 'regtest';
    case 'signet':
    default:
      return 'signet';
  }
}

/**
 * Fee configuration for BTC transactions
 * 
 * TODO: Calculate dynamically based on:
 * - Current network fee rates
 * - Transaction size estimation
 * - User-selected priority (low/medium/high)
 */
export const PEGIN_FEE_CONFIG = {
  /**
   * Default estimated fee for BTC transaction (in satoshis)
   * This is a conservative estimate that should work for most cases
   */
  defaultFee: 10_000n,
  
  /**
   * Minimum fee to prevent transaction from being rejected
   */
  minimumFee: 1_000n,
};

