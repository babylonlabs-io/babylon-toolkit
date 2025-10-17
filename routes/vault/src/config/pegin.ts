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
   * HARDCODED: Local liquidators (challengers) BTC public keys
   * These are the two liquidators configured in btc-vault-deployment
   * From: LIQUIDATOR_1_BTC_PUBKEY and LIQUIDATOR_2_BTC_PUBKEY
   * TODO: Fetch from backend API
   */
  liquidatorBtcPubkeys: [
    '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', // Liquidator 1
    'c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5', // Liquidator 2
  ],

  /**
   * HARDCODED: Estimated fee for BTC transaction
   * TODO: calculate dynamically based on the tx size
   */
  btcTransactionFee: 10_000n,
};
