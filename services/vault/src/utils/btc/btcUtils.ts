/**
 * Bitcoin Utilities
 *
 * Common utility functions for Bitcoin operations
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

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

/**
 * Decode a scriptPubKey hex (with or without 0x prefix) back to a BTC address.
 * Uses the current environment's BTC network configuration.
 *
 * Throws on invalid/unsupported scripts — this is shown to the user as a
 * destination address, so silent fallbacks would mask a real indexer or
 * configuration problem.
 */
export function scriptPubKeyHexToBtcAddress(scriptPubKeyHex: string): string {
  const cleanHex = stripHexPrefix(scriptPubKeyHex);
  if (cleanHex.length === 0 || cleanHex.length % 2 !== 0) {
    throw new Error(
      `Invalid scriptPubKey hex length: ${cleanHex.length} (must be non-empty and even)`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error("Invalid scriptPubKey hex: contains non-hex characters");
  }
  // Build the script bytes via `globalThis.Buffer.alloc(...)`, the Buffer that
  // `bitcoin.address.fromOutputScript` accepts in every runtime. In the browser
  // bundle `@/polyfills/globalBuffer` sets that global to the npm "buffer"
  // package imported above, so the two are one class there; under Node it is
  // Node's own Buffer.
  const GlobalBuffer = (globalThis as { Buffer: typeof Buffer }).Buffer;
  const bytes = GlobalBuffer.alloc(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bitcoin.address.fromOutputScript(bytes, getBitcoinJsNetwork());
}
