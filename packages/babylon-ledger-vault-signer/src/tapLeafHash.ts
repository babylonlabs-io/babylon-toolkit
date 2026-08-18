/**
 * BIP-341 TapLeaf hash for the SIGN_PSBT expected-signature table (#2219).
 *
 * Standalone ~25-line copy of the ts-sdk reference
 * (`verifyScriptPathSchnorrSignature.ts` `encodeCompactSize` +
 * `computeTapLeafHash`) — this package must not depend on ts-sdk. The leaf
 * version is an explicit parameter with no default, avoiding bip341's
 * `leaf.version || LEAF_VERSION_TAPSCRIPT` falsy-zero footgun and the
 * deep-import fragility. Gated against `bip341.tapleafHash` and the BIP-341
 * wallet test vector in `__tests__/tapLeafHash.test.ts`.
 *
 * @module ledger-vault-signer/tapLeafHash
 */

import { crypto as bcrypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";

// Bitcoin CompactSize (varint) prefix markers — values fixed by the protocol.
// https://developer.bitcoin.org/reference/transactions.html#compactsize-unsigned-integers
const COMPACT_SIZE_UINT16_PREFIX = 0xfd; // value in [0xfd, 0xffff] → 0xfd + uint16 LE
const COMPACT_SIZE_UINT32_PREFIX = 0xfe; // value in [0x10000, 0xffffffff] → 0xfe + uint32 LE
const COMPACT_SIZE_UINT16_MAX = 0xffff;
const COMPACT_SIZE_UINT32_MAX = 0xffffffff;

/**
 * Encode a length as a Bitcoin CompactSize. WOTS leaf scripts exceed 252
 * bytes, so the multi-byte forms are required, not just the 1-byte fast path.
 */
function encodeCompactSize(n: number): Buffer {
  if (n < COMPACT_SIZE_UINT16_PREFIX) {
    return Buffer.from([n]);
  }
  if (n <= COMPACT_SIZE_UINT16_MAX) {
    const value = Buffer.alloc(2); // uint16, little-endian
    value.writeUInt16LE(n);
    return Buffer.concat([Buffer.from([COMPACT_SIZE_UINT16_PREFIX]), value]);
  }
  if (n <= COMPACT_SIZE_UINT32_MAX) {
    const value = Buffer.alloc(4); // uint32, little-endian
    value.writeUInt32LE(n);
    return Buffer.concat([Buffer.from([COMPACT_SIZE_UINT32_PREFIX]), value]);
  }
  throw new Error(`Script too large to encode as CompactSize: ${n} bytes`);
}

/** BIP-341 tag for the TapLeaf hash. */
const TAPLEAF_TAG = "TapLeaf";

/** BIP-341: `tagged_hash("TapLeaf", leaf_version(1) ‖ compact_size(len(script)) ‖ script)`. */
export function tapLeafHash(leafVersion: number, script: Uint8Array): Buffer {
  const preimage = Buffer.concat([Buffer.from([leafVersion]), encodeCompactSize(script.length), Buffer.from(script)]);
  return bcrypto.taggedHash(TAPLEAF_TAG, preimage);
}
