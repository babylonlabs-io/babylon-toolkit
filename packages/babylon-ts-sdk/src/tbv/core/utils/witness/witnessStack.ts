/**
 * Consensus witness-stack decoding, shared by every module that reads a
 * witness we did not build.
 *
 * Two independent decoders drifted apart before this existed: one accepted
 * non-minimal CompactSize encodings, the other rejected them. vaultd decodes
 * with rust-bitcoin, whose `VarInt::consensus_decode`
 * (0.32.8 `consensus/encode.rs:493-522`) returns `NonMinimalVarInt` for a 0xfd
 * carrying < 0xfd and a 0xfe carrying < 0x10000 — so the strict reading is the
 * only one that matches what the network will accept.
 *
 * @module tbv/core/utils/witness/witnessStack
 */

/** CompactSize discriminators; 0xff (u64) is out of range for a witness. */
const COMPACT_SIZE_UINT16_PREFIX = 0xfd;
const COMPACT_SIZE_UINT32_PREFIX = 0xfe;
const COMPACT_SIZE_UINT16_BYTES = 3;
const COMPACT_SIZE_UINT32_BYTES = 5;
const COMPACT_SIZE_UINT16_MIN_VALUE = 0xfd;
const COMPACT_SIZE_UINT32_MIN_VALUE = 0x10000;

/**
 * Decode a consensus-encoded witness stack: item count, then (len, bytes)*.
 *
 * @param witness - The consensus-encoded witness bytes.
 * @param subject - Names the witness in error messages (e.g. "finalScriptWitness").
 * @returns The stack items, as views over `witness`.
 * @throws If the encoding is truncated, non-minimal, out of range, or leaves
 *         trailing bytes.
 */
export function decodeWitnessStack(
  witness: Uint8Array,
  subject: string,
): Uint8Array[] {
  let offset = 0;

  const readCompactSize = (): number => {
    if (offset >= witness.length) {
      throw new Error(`${subject} is truncated`);
    }
    const first = witness[offset];
    if (first < COMPACT_SIZE_UINT16_PREFIX) {
      offset += 1;
      return first;
    }
    if (first === COMPACT_SIZE_UINT16_PREFIX) {
      if (offset + COMPACT_SIZE_UINT16_BYTES > witness.length) {
        throw new Error(`${subject} is truncated`);
      }
      const value = witness[offset + 1] | (witness[offset + 2] << 8);
      if (value < COMPACT_SIZE_UINT16_MIN_VALUE) {
        throw new Error(`${subject} has a non-minimal length encoding`);
      }
      offset += COMPACT_SIZE_UINT16_BYTES;
      return value;
    }
    if (first === COMPACT_SIZE_UINT32_PREFIX) {
      if (offset + COMPACT_SIZE_UINT32_BYTES > witness.length) {
        throw new Error(`${subject} is truncated`);
      }
      const value =
        (witness[offset + 1] |
          (witness[offset + 2] << 8) |
          (witness[offset + 3] << 16) |
          (witness[offset + 4] << 24)) >>>
        0;
      if (value < COMPACT_SIZE_UINT32_MIN_VALUE) {
        throw new Error(`${subject} has a non-minimal length encoding`);
      }
      offset += COMPACT_SIZE_UINT32_BYTES;
      return value;
    }
    throw new Error(`${subject} carries an out-of-range item length`);
  };

  const count = readCompactSize();
  const items: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const len = readCompactSize();
    if (offset + len > witness.length) {
      throw new Error(`${subject} is truncated`);
    }
    items.push(witness.subarray(offset, offset + len));
    offset += len;
  }
  if (offset !== witness.length) {
    throw new Error(`${subject} has trailing bytes`);
  }
  return items;
}
