/**
 * Bitcoin Utilities
 *
 * Common utility functions for Bitcoin operations
 */

import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getNetworkConfigBTC } from "../../config";

/**
 * Strip "0x" prefix from hex string if present
 * Bitcoin expects plain hex (no "0x" prefix), but frontend uses Ethereum-style "0x"-prefixed hex
 *
 * @param hex - Hex string with or without "0x" prefix
 * @returns Hex string without "0x" prefix
 *
 * @example
 * ```ts
 * stripHexPrefix('0xabc123') // 'abc123'
 * stripHexPrefix('abc123')   // 'abc123'
 * ```
 */
export function stripHexPrefix(hex: string): string {
  return hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
}

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
  // Build the script bytes via `globalThis.Buffer.alloc(...)` rather than the
  // npm "buffer" polyfill imported at the top of this file. Under the jsdom
  // test environment `Buffer.from(hex, "hex")` (polyfill) silently returns
  // zero bytes, and `Buffer.from(Uint8Array)` (polyfill) is rejected by
  // `bitcoin.address.fromOutputScript` even when the bytes are correct.
  // Reaching for the global Buffer sidesteps both issues. Safe across our
  // runtimes: vite-plugin-node-polyfills exposes `globalThis.Buffer` in the
  // browser bundle, and Node provides it natively in tests.
  const GlobalBuffer = (globalThis as { Buffer: typeof Buffer }).Buffer;
  const bytes = GlobalBuffer.alloc(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bitcoin.address.fromOutputScript(bytes, getBitcoinJsNetwork());
}

/**
 * Derive the BIP-86 P2TR scriptPubKey (0x-prefixed hex) from an x-only public key.
 *
 * Matches Rust `Bip86KeyConnector::generate_taproot_script_pubkey`: a keypath-only
 * P2TR output with no script tree. Used to compute the expected payout address for
 * vault keeper claimers, whose payout goes to their own BIP-86 address rather than
 * the depositor's registered payout address.
 */
export function deriveBip86ScriptPubKeyHex(xOnlyPubkeyHex: string): string {
  const cleanHex = stripHexPrefix(xOnlyPubkeyHex);
  if (!/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
    throw new Error(
      "Invalid x-only pubkey: must be 64 hex characters (32 bytes, no 0x prefix)",
    );
  }
  const { output } = bitcoin.payments.p2tr({
    internalPubkey: Buffer.from(cleanHex, "hex"),
    network: getBitcoinJsNetwork(),
  });
  if (!output) {
    throw new Error("Failed to derive BIP-86 P2TR scriptPubKey");
  }
  return `0x${output.toString("hex")}`;
}
