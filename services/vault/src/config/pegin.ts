/**
 * Peg-in network configuration helpers.
 */

import { getBTCNetwork, type BtcNetworkName } from "@/config/network";

/**
 * WASM network format (different from standard Bitcoin network names).
 * WASM expects: "bitcoin" (not "mainnet"), "testnet", "regtest".
 */
type WASMNetwork = "bitcoin" | "testnet" | "regtest";

function toWASMNetwork(network: BtcNetworkName): WASMNetwork {
  switch (network) {
    case "mainnet":
      return "bitcoin";
    case "signet":
      return "testnet";
  }
}

/**
 * Get BTC network in WASM-friendly format.
 */
export function getBTCNetworkForWASM(): WASMNetwork {
  return toWASMNetwork(getBTCNetwork());
}
