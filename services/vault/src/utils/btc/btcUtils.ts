/**
 * Bitcoin Utilities
 *
 * Common utility functions for Bitcoin operations
 */

import * as bitcoin from "bitcoinjs-lib";

import { getNetworkConfigBTC } from "../../config";

/**
 * Resolve the bitcoinjs-lib `Network` object from the current environment's
 * BTC network configuration. Signet/regtest reuse the testnet bech32 HRP and
 * version bytes, so they map to `networks.testnet`.
 */
function getBitcoinJsNetwork(): bitcoin.Network {
  const { network } = getNetworkConfigBTC();
  return network === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;
}

/**
 * Convert a BTC address to its scriptPubKey hex representation (0x-prefixed).
 * Uses the current environment's BTC network configuration.
 */
export function btcAddressToScriptPubKeyHex(address: string): string {
  return `0x${bitcoin.address.toOutputScript(address, getBitcoinJsNetwork()).toString("hex")}`;
}
