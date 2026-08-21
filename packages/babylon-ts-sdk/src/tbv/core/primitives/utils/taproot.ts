/**
 * BIP-341 Taproot primitives shared by the PSBT builders and verifiers.
 *
 * Everything here is a byte-level restatement of BIP-341; the spec is the
 * source of truth for each constant and each hash preimage.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
 * @module tbv/core/primitives/utils/taproot
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { crypto as bcrypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";

// Bitcoin CompactSize (varint) prefix markers — values fixed by the protocol.
// https://developer.bitcoin.org/reference/transactions.html#compactsize-unsigned-integers
const COMPACT_SIZE_UINT16_PREFIX = 0xfd; // value in [0xfd, 0xffff] → 0xfd + uint16 LE
const COMPACT_SIZE_UINT32_PREFIX = 0xfe; // value in [0x10000, 0xffffffff] → 0xfe + uint32 LE
const COMPACT_SIZE_UINT16_MAX = 0xffff;
const COMPACT_SIZE_UINT32_MAX = 0xffffffff;

/** BIP-341 tag for the TapLeaf hash. */
const TAPLEAF_TAG = "TapLeaf";
/** BIP-341 tag for an internal merkle node of the taptree. */
const TAPBRANCH_TAG = "TapBranch";
/** BIP-341 tag for the output-key tweak. */
const TAPTWEAK_TAG = "TapTweak";

/** BIP-341 control block prefix: 1 leaf-version/parity byte + 32-byte internal key. */
const CONTROL_BLOCK_PREFIX_LEN = 33;
/** Each merkle-path element in a control block is a 32-byte node hash. */
const CONTROL_BLOCK_NODE_LEN = 32;
/** BIP-341 caps the taptree at 128 levels, so the path holds at most 128 nodes. */
const CONTROL_BLOCK_MAX_NODES = 128;
/** Low bit of control-block byte 0 carries the output key's y-parity. */
const CONTROL_BLOCK_PARITY_MASK = 0x01;
/** Remaining bits of control-block byte 0 carry the leaf version. */
const CONTROL_BLOCK_LEAF_VERSION_MASK = 0xfe;

/** A P2TR scriptPubKey is `OP_1 <32-byte push>` followed by the output key. */
const P2TR_SCRIPT_PUBKEY_PREFIX = Buffer.from([0x51, 0x20]);

/**
 * Encode a length as a Bitcoin CompactSize (varint). Tapscript leaf scripts can
 * exceed 252 bytes (WOTS scripts), so the multi-byte forms are required, not
 * just the single-byte fast path.
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

/**
 * Compute the BIP-341 TapLeaf hash for a tapscript leaf:
 * `tagged_hash("TapLeaf", leaf_version || compact_size(script) || script)`.
 */
export function computeTapLeafHash(
  leafVersion: number,
  script: Uint8Array,
): Buffer {
  const preimage = Buffer.concat([
    Buffer.from([leafVersion]),
    encodeCompactSize(script.length),
    Buffer.from(script),
  ]);
  return bcrypto.taggedHash(TAPLEAF_TAG, preimage);
}

export interface TaprootScriptPathBinding {
  /** Tapscript leaf version, e.g. `0xc0`. */
  leafVersion: number;
  /** The tapscript leaf being spent. */
  script: Uint8Array;
  /** BIP-341 control block: version/parity byte, internal key, merkle path. */
  controlBlock: Uint8Array;
}

/**
 * Recompute the P2TR scriptPubKey that a `(leafVersion, script, controlBlock)`
 * triple can spend, by walking the control block's merkle path to the taptree
 * root and tweaking the control block's internal key with it (BIP-341
 * "Script validation rules").
 *
 * Comparing the result against a real previous output is what proves the triple
 * belongs to that output rather than to some other taptree.
 *
 * @throws If the control block is malformed, the leaf version disagrees with
 *   the control block, the tweak is off-curve, or the recovered output key's
 *   parity contradicts the control block.
 */
export function computeTaprootScriptPubKey(
  binding: TaprootScriptPathBinding,
): Buffer {
  const { leafVersion, script, controlBlock } = binding;

  const pathLen = controlBlock.length - CONTROL_BLOCK_PREFIX_LEN;
  if (
    pathLen < 0 ||
    pathLen % CONTROL_BLOCK_NODE_LEN !== 0 ||
    pathLen / CONTROL_BLOCK_NODE_LEN > CONTROL_BLOCK_MAX_NODES
  ) {
    throw new Error(
      `Malformed Taproot control block: length ${controlBlock.length} must be ` +
        `${CONTROL_BLOCK_PREFIX_LEN} + 32*m with 0 <= m <= ${CONTROL_BLOCK_MAX_NODES}`,
    );
  }

  const controlLeafVersion = controlBlock[0] & CONTROL_BLOCK_LEAF_VERSION_MASK;
  if (controlLeafVersion !== leafVersion) {
    throw new Error(
      `Taproot control block leaf version 0x${controlLeafVersion.toString(16)} ` +
        `does not match the tapLeafScript leaf version 0x${leafVersion.toString(16)}`,
    );
  }

  const internalKey = Buffer.from(
    controlBlock.subarray(1, CONTROL_BLOCK_PREFIX_LEN),
  );

  // Fold the merkle path into the taptree root; siblings are hashed in
  // lexicographic order (BIP-341).
  let node = computeTapLeafHash(leafVersion, script);
  for (
    let offset = CONTROL_BLOCK_PREFIX_LEN;
    offset < controlBlock.length;
    offset += CONTROL_BLOCK_NODE_LEN
  ) {
    const sibling = Buffer.from(
      controlBlock.subarray(offset, offset + CONTROL_BLOCK_NODE_LEN),
    );
    node = bcrypto.taggedHash(
      TAPBRANCH_TAG,
      Buffer.compare(node, sibling) <= 0
        ? Buffer.concat([node, sibling])
        : Buffer.concat([sibling, node]),
    );
  }

  const tweak = bcrypto.taggedHash(
    TAPTWEAK_TAG,
    Buffer.concat([internalKey, node]),
  );
  const tweaked = ecc.xOnlyPointAddTweak(internalKey, tweak);
  if (tweaked === null) {
    throw new Error(
      "Taproot control block does not yield a valid output key (tweak is off-curve)",
    );
  }
  const expectedParity = controlBlock[0] & CONTROL_BLOCK_PARITY_MASK;
  if (tweaked.parity !== expectedParity) {
    throw new Error(
      `Taproot output key parity ${tweaked.parity} contradicts the control ` +
        `block's parity bit ${expectedParity}`,
    );
  }

  return Buffer.concat([
    P2TR_SCRIPT_PUBKEY_PREFIX,
    Buffer.from(tweaked.xOnlyPubkey),
  ]);
}
