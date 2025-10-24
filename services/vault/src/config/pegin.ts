/**
 * Peg-in Configuration for Local Development
 * 
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
