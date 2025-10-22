/**
 * Peg-in Configuration for Local Development
 *
 * IMPORTANT: These values are HARDCODED for local Anvil testnet.
 * In production, these would be fetched.
 */

import { getBTCNetwork, type BTCNetwork } from '@babylonlabs-io/config';

/**
 * WASM network format (different from standard Bitcoin network names)
 */
type WASMNetwork = 'bitcoin' | 'testnet' | 'regtest';

/**
 * Convert standard BTC network to WASM-friendly format
 * WASM expects: "bitcoin" (not "mainnet"), "testnet", "regtest"
 */
function toWASMNetwork(network: BTCNetwork): WASMNetwork {
  switch (network) {
    case 'mainnet':
      return 'bitcoin';
    case 'signet':
    case 'testnet':
      return 'testnet';
    case 'regtest':
      return 'regtest';
  }
}

/**
 * Get BTC network in WASM-friendly format
 * Convenience function for getting the network directly in WASM format
 */
export function getBTCNetworkForWASM(): WASMNetwork {
  return toWASMNetwork(getBTCNetwork());
}

// TODO: To be replaced by calling the backend API to get liquidators
export const LOCAL_PEGIN_CONFIG = {
  /**
   * HARDCODED: Vault-devnet liquidators (challengers) BTC public keys
   * These are the two liquidators configured in vault-devnet deployment
   * From: L1_BTC_PUBKEY and L2_BTC_PUBKEY (vault-devnet)
   * TODO: Fetch from backend API
   */
  liquidatorBtcPubkeys: [
    'e288d2c35ffa4c3930004c81de604b5000a9ca06ce55faaf6ac092de309f9373', // L1 (Liquidator 1)
    'bb6d11b89db08fe70f1cd4293468c85cae62e57316546db9651c6e1244724192', // L2 (Liquidator 2)
  ],

  /**
   * Fallback fee rate for BTC transactions (in sat/vbyte)
   *
   * Used ONLY when mempool API is unavailable or returns an error.
   * In normal operation, fee rates are fetched dynamically from mempool.space API
   * using the useNetworkFees() hook.
   *
   * Value: 2 sat/vbyte is a conservative estimate that works in most conditions:
   * - Historically sufficient for confirmation within 6 blocks (~1 hour)
   * - Safe fallback during network congestion
   * - Higher than minimum relay fee (1 sat/vb) to ensure acceptance
   *
   * Production recommendation: Use hourFee from mempool API (see useNetworkFees hook)
   */
  fallbackFeeRate: 2, // sat/vbyte
};
