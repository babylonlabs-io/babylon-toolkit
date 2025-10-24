/**
 * Peg-in Configuration for Local Development
 * 
 * IMPORTANT: These values are HARDCODED for local Anvil testnet.
 * In production, these would be fetched from backend API.
 */

/**
 * WASM network format (different from standard Bitcoin network names)
 */
type WASMNetwork = 'bitcoin' | 'testnet' | 'regtest';

/**
 * Get BTC network from environment variable
 * TODO: Import from @babylonlabs-io/config when available
 */
function getBTCNetwork(): string {
  return import.meta.env.NEXT_PUBLIC_NETWORK || 'testnet';
}

/**
 * Convert standard BTC network to WASM-friendly format
 * WASM expects: "bitcoin" (not "mainnet"), "testnet", "regtest"
 */
function toWASMNetwork(network: string): WASMNetwork {
  switch (network) {
    case 'mainnet':
      return 'bitcoin';
    case 'signet':
    case 'testnet':
      return 'testnet';
    case 'regtest':
      return 'regtest';
    default:
      return 'testnet'; // Default to testnet
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
   * HARDCODED: Estimated fee for BTC transaction
   * TODO: calculate dynamically based on the tx size
   */
  btcTransactionFee: 10_000n,
  
  /**
   * Default fee for BTC transactions (alias for btcTransactionFee)
   */
  defaultFee: 10_000n,
};

// Alias for backwards compatibility
export const PEGIN_FEE_CONFIG = LOCAL_PEGIN_CONFIG;
