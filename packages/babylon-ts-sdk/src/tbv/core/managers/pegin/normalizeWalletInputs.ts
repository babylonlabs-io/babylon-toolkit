/**
 * Normalizers for wallet-returned values consumed by the Pre-PegIn flow.
 *
 * @module managers/pegin/normalizeWalletInputs
 */

import { Buffer } from "buffer";
import type { Hex } from "viem";

import { processPublicKeyToXOnly } from "../../primitives/utils/bitcoin";

const HEX_SIGNATURE_REGEX = /^0x[0-9a-f]+$/i;
const UNPREFIXED_HEX_SIGNATURE_REGEX = /^[0-9a-f]+$/i;
const BASE64_SIGNATURE_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Normalize a wallet-returned BTC public key to the canonical x-only
 * 64-char lowercase hex form (no 0x prefix).
 *
 * Throws on empty/non-string input. Idempotent on x-only input.
 */
export function normalizeXOnlyPubkey(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("BTC wallet returned empty public key");
  }
  // Lowercase so case-sensitive equality checks downstream don't fail
  // on uppercase wallet output (processPublicKeyToXOnly passes a 64-char
  // input through unchanged).
  return processPublicKeyToXOnly(raw).toLowerCase();
}

/**
 * Normalize a wallet-returned BIP-322 signature into 0x-prefixed hex.
 *
 * Accepts:
 *  - 0x-prefixed lowercase/uppercase hex
 *  - unprefixed hex (wins over base64 when input is pure `[0-9a-fA-F]+`)
 *  - canonical standard base64 (`[A-Za-z0-9+/]` with `=` padding to a
 *    multiple of 4 and no non-canonical encodings)
 *
 * Rejects URL-safe base64 (`-`/`_`) and base64 without padding. Wallets
 * known to return BIP-322 signatures (Keystone, UniSat, OKX, OneKey,
 * Unisat) all use standard base64; URL-safe is an explicit non-goal.
 */
export function normalizePopSignature(raw: unknown): Hex {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("BTC wallet returned empty BIP-322 signature");
  }

  if (raw.startsWith("0x") || raw.startsWith("0X")) {
    if (
      !HEX_SIGNATURE_REGEX.test(raw) ||
      raw.length < 4 ||
      raw.length % 2 !== 0
    ) {
      throw new Error("BTC wallet returned malformed hex BIP-322 signature");
    }
    return raw.toLowerCase() as Hex;
  }

  // Prefer hex when the input could be either: every hex char is also a
  // valid base64 char, so the base64 branch alone would silently misdecode
  // a wallet returning "deadbeef" instead of "0xdeadbeef".
  if (UNPREFIXED_HEX_SIGNATURE_REGEX.test(raw)) {
    if (raw.length % 2 !== 0) {
      throw new Error("BTC wallet returned malformed hex BIP-322 signature");
    }
    return `0x${raw.toLowerCase()}` as Hex;
  }

  if (!BASE64_SIGNATURE_REGEX.test(raw) || raw.length % 4 !== 0) {
    throw new Error("BTC wallet returned malformed base64 BIP-322 signature");
  }
  const bytes = Buffer.from(raw, "base64");
  // Round-trip to reject non-canonical base64 (e.g. "AB==" decodes but
  // re-encodes to "AA==").
  if (bytes.length === 0 || bytes.toString("base64") !== raw) {
    throw new Error("BTC wallet returned malformed base64 BIP-322 signature");
  }
  return `0x${bytes.toString("hex")}` as Hex;
}
