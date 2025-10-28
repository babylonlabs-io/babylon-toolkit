/**
 * Peg-in Configuration for Local Development
 */

import { getBTCNetwork, type BTCNetwork } from "@babylonlabs-io/config";
import { Network } from "@babylonlabs-io/wallet-connector";

/**
 * WASM network format (different from standard Bitcoin network names)
 */
type WASMNetwork = "bitcoin" | "testnet" | "regtest";

/**
 * Convert standard BTC network to WASM-friendly format
 * WASM expects: "bitcoin" (not "mainnet"), "testnet", "regtest"
 */
function toWASMNetwork(network: BTCNetwork): WASMNetwork {
  switch (network) {
    case Network.MAINNET:
      return "bitcoin";
    case Network.SIGNET:
    case Network.TESTNET:
      return "testnet";
    default:
      // Default to testnet for any unknown network
      return "testnet";
  }
}

/**
 * Get BTC network in WASM-friendly format
 * Convenience function for getting the network directly in WASM format
 */
export function getBTCNetworkForWASM(): WASMNetwork {
  return toWASMNetwork(getBTCNetwork());
}

export const LOCAL_PEGIN_CONFIG = {
  /**
   * HARDCODED: Estimated fee for BTC transaction
   * TODO: calculate dynamically based on the tx size
   */
  btcTransactionFee: 10_000n,
};
