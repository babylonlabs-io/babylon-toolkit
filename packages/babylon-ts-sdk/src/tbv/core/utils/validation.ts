/**
 * Shared validation constants for Bitcoin-related input sanitization.
 *
 * These are used across mempool API clients, broadcast services, and
 * transaction construction to enforce consistent format checks.
 */

/** Non-empty string of hexadecimal characters (case-insensitive). */
export const HEX_RE = /^[0-9a-fA-F]+$/;

/** Bitcoin txid: exactly 64 hex characters (32 bytes). */
export const TXID_RE = /^[0-9a-fA-F]{64}$/;

/**
 * Bitcoin address format gate: 25–62 alphanumeric characters.
 * Covers legacy (P2PKH/P2SH), bech32 (P2WPKH/P2WSH), and bech32m (P2TR).
 * This is a format gate to prevent path-traversal — not full address validation.
 */
export const BITCOIN_ADDRESS_RE = /^[a-zA-Z0-9]{25,62}$/;

/**
 * Known Bitcoin scriptPubKey prefixes:
 * - P2PKH:  76a914...88ac (25 bytes)
 * - P2SH:   a914...87    (23 bytes)
 * - P2WPKH: 0014...      (22 bytes)
 * - P2WSH:  0020...      (34 bytes)
 * - P2TR:   5120...      (34 bytes)
 */
export const KNOWN_SCRIPT_PREFIXES = [
  "76a914",
  "a914",
  "0014",
  "0020",
  "5120",
] as const;

/**
 * Upper bound on the implied miner fee (0.01 BTC = 1,000,000 sats).
 * Catches inflated input values from a compromised mempool API — if inputs are
 * grossly overstated the implied fee becomes unreasonably large. The April 2024
 * Runes spike saw ~450 sat/vB; at 500 vB that's ~225k sats, well under this cap.
 */
export const MAX_REASONABLE_FEE_SATS = 1_000_000n;
