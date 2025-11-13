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

/**
 * Default BTC transaction fee in satoshis
 * Used as fallback when dynamic fee calculation fails
 * @deprecated Use calculateDynamicBtcFee() from services/fees instead
 */
export const DEFAULT_BTC_TRANSACTION_FEE = 10_000n;

export const LOCAL_PEGIN_CONFIG = {
  /**
   * Default fee for BTC transaction (fallback only)
   * Actual fees are calculated dynamically based on network conditions
   */
  defaultBtcTransactionFee: DEFAULT_BTC_TRANSACTION_FEE,
  defaultFeeRate: 10, // sat/vbyte - fallback rate when API is unavailable
};
