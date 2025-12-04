/**
 * Unspendable public key used for Taproot internal key in covenant transactions.
 *
 * This is a nothing-up-my-sleeve number as specified in BIP-341.
 * The taproot internal key is used to disable keypath spending in vault transactions.
 *
 * @see https://en.bitcoin.it/wiki/BIP_0341
 */
import { Buffer } from "buffer";

export const TAP_INTERNAL_KEY =
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0";

/**
 * Taproot internal public key as a Buffer (x-only coordinate).
 * This is the same as TAP_INTERNAL_KEY but in Buffer format for convenience.
 */
export const tapInternalPubkey = Buffer.from(TAP_INTERNAL_KEY, "hex");
