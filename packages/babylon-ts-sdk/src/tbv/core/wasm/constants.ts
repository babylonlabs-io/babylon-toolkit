/**
 * Protocol constants that do not require loading the vault WASM module.
 *
 * Keeping these values local lets Bitcoin builders construct PSBT metadata
 * without resolving or evaluating the optional WASM peer at module-import
 * time. The hex value is the BIP-341 nothing-up-my-sleeve internal key and is
 * pinned by the vault protocol.
 */
export const TAP_INTERNAL_KEY =
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

const HEX_CHARS_PER_BYTE = 2;

export const tapInternalPubkey = Uint8Array.from(
  { length: TAP_INTERNAL_KEY.length / HEX_CHARS_PER_BYTE },
  (_, index) =>
    Number.parseInt(
      TAP_INTERNAL_KEY.slice(
        index * HEX_CHARS_PER_BYTE,
        index * HEX_CHARS_PER_BYTE + HEX_CHARS_PER_BYTE,
      ),
      16,
    ),
);
