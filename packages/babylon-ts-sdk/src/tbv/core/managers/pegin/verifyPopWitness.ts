/**
 * Host-side check of the BIP-322 proof-of-possession witness a wallet returns,
 * before it is committed to the Ethereum registration.
 *
 * vaultd verifies the PoP off-chain from the consensus-encoded witness
 * (`btc-vault crates/btc-signer/src/message.rs:94-145`): one item ⇒ P2TR
 * key-path Schnorr over the BIP-86 tweaked key, two items ⇒ P2WPKH, anything
 * else ⇒ `UnsupportedWitnessFormat`. A bad PoP is a PERMANENT ingestion
 * failure (`InvalidDepositorPop`), so catching it here saves a registration.
 * No wallet test (hardware or software) proves a returned PoP validates —
 * this is the first place anything checks it.
 *
 * P2TR is verified with the package's existing BIP-322 verifier (64-byte
 * SIGHASH_DEFAULT or 65-byte SIGHASH_ALL, matching what the `bip322` crate
 * 0.0.10 accepts in `verify.rs:213-236`). P2WPKH mirrors the 2-item arm of
 * `message.rs:107-133`: parse the compressed pubkey, require its x-only
 * form to equal the depositor key, then BIP-322-verify the witness against
 * that pubkey's P2WPKH address.
 *
 * @module managers/pegin/verifyPopWitness
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import type { Hex } from "viem";
import { decodeWitnessStack } from "../../utils/witness/witnessStack";

import {
  verifyBip322P2wpkhSimple,
  verifyBip322Simple,
} from "../../clients/vault-provider/auth/bip322Verify";

const P2TR_WITNESS_ITEMS = 1;
const P2WPKH_WITNESS_ITEMS = 2;
/** SEC1 compressed pubkey: 0x02/0x03 prefix + 32-byte x coordinate. */
const COMPRESSED_PUBKEY_BYTES = 33;
/** SEC1 prefix bytes: 0x02 even Y, 0x03 odd Y; the x coordinate follows. */
const SEC1_EVEN_Y_PREFIX = 0x02;
const SEC1_ODD_Y_PREFIX = 0x03;
const SEC1_PREFIX_BYTES = 1;
const SCHNORR_SIG_BYTES = 64;
/** BIP-341 hash types: 0x00 default (64-byte sig), 0x01 ALL (65-byte sig with trailing type byte). */
const SIGHASH_DEFAULT = 0x00;
const SIGHASH_ALL = 0x01;

const X_ONLY_PUBKEY_HEX = /^[0-9a-f]{64}$/i;
/** `normalizePopSignature` hands us 0x-prefixed lowercase hex; hold it to that. */
const WITNESS_BODY_HEX = /^(?:[0-9a-f]{2})+$/;

export type PopWitnessVerdict =
  | { readonly kind: "p2tr-verified" }
  | { readonly kind: "p2wpkh-verified" };

function decodeWitnessItems(witnessHex: Hex): Uint8Array[] {
  const body = witnessHex.slice(2);
  // Buffer.from(_, "hex") stops silently at the first invalid character.
  if (!WITNESS_BODY_HEX.test(body)) {
    throw new Error(
      "proof of possession witness is not even-length lowercase hex",
    );
  }
  return decodeWitnessStack(
    Uint8Array.from(Buffer.from(body, "hex")),
    "proof of possession witness",
  );
}

/**
 * Decode a consensus-encoded PoP witness and verify it against the
 * depositor's key: Schnorr for the P2TR shape, ECDSA over the BIP-322
 * P2WPKH virtual transaction for the two-item shape.
 *
 * @param messageBytes     - Bytes of the PoP message that was signed.
 * @param depositorXOnlyHex - Depositor x-only pubkey, bare 64-char hex
 *                            (enforced, not assumed).
 * @param witnessHex       - 0x-prefixed consensus-encoded witness.
 * @throws If the witness is malformed, has an unsupported item count, the
 *         depositor key is not bare x-only hex, the witness pubkey is not
 *         the depositor's, or the signature does not verify.
 */
export function verifyPopWitness(
  messageBytes: Uint8Array,
  depositorXOnlyHex: string,
  witnessHex: Hex,
): PopWitnessVerdict {
  const items = decodeWitnessItems(witnessHex);

  if (items.length === P2TR_WITNESS_ITEMS) {
    const [item] = items;
    // vaultd (bip322 crate `verify.rs:213-236`) accepts 64 bytes = SIGHASH_DEFAULT,
    // or 65 bytes ending in 0x01 = SIGHASH_ALL; mirror exactly that, nothing looser.
    let signature: Uint8Array;
    let hashType: number;
    if (item.length === SCHNORR_SIG_BYTES) {
      signature = item;
      hashType = SIGHASH_DEFAULT;
    } else if (
      item.length === SCHNORR_SIG_BYTES + 1 &&
      item[SCHNORR_SIG_BYTES] === SIGHASH_ALL
    ) {
      signature = item.subarray(0, SCHNORR_SIG_BYTES);
      hashType = SIGHASH_ALL;
    } else {
      throw new Error(
        "proof of possession witness item must be a 64-byte Schnorr signature " +
          "(or 65 bytes ending in 0x01)",
      );
    }

    // Guard the caller contract: a prefixed or short key would decode to the
    // wrong bytes and surface as "does not verify", hiding the real fault.
    if (!X_ONLY_PUBKEY_HEX.test(depositorXOnlyHex)) {
      throw new Error(
        `depositor public key must be bare 64-char x-only hex, got "${depositorXOnlyHex}"`,
      );
    }
    const xOnly = Uint8Array.from(Buffer.from(depositorXOnlyHex, "hex"));
    if (!verifyBip322Simple(messageBytes, xOnly, signature, hashType)) {
      throw new Error(
        "proof of possession signature does not verify against the depositor key",
      );
    }
    return { kind: "p2tr-verified" };
  }

  if (items.length === P2WPKH_WITNESS_ITEMS) {
    if (!X_ONLY_PUBKEY_HEX.test(depositorXOnlyHex)) {
      throw new Error(
        `depositor public key must be bare 64-char x-only hex, got "${depositorXOnlyHex}"`,
      );
    }
    const [encodedSignature, pubkey] = items;
    if (
      pubkey.length !== COMPRESSED_PUBKEY_BYTES ||
      (pubkey[0] !== SEC1_EVEN_Y_PREFIX && pubkey[0] !== SEC1_ODD_Y_PREFIX)
    ) {
      throw new Error(
        `proof of possession P2WPKH witness item 1 is not a compressed public key ` +
          `(${pubkey.length} bytes, prefix 0x${pubkey[0]?.toString(16) ?? "none"})`,
      );
    }
    // Full curve-point parse, as vaultd's CompressedPublicKey::from_slice
    // (message.rs:111-116) — before the key compare, matching its order.
    if (!ecc.isPointCompressed(pubkey)) {
      throw new Error(
        "proof of possession P2WPKH witness pubkey is not a valid secp256k1 point",
      );
    }
    // Pubkey compare (message.rs:117-123, WitnessPubkeyMismatch): witness
    // item 1 must be the depositor's compressed key — a wrong-account
    // signature fails HERE, not as a generic invalid signature.
    const witnessXOnlyHex = Buffer.from(
      pubkey.subarray(SEC1_PREFIX_BYTES),
    ).toString("hex");
    if (witnessXOnlyHex !== depositorXOnlyHex.toLowerCase()) {
      throw new Error(
        `proof of possession witness pubkey does not match the depositor key: ` +
          `witness carries ${witnessXOnlyHex}, expected ${depositorXOnlyHex}`,
      );
    }
    // BIP-322 simple verification against the P2WPKH address of the witness
    // pubkey (message.rs:125-133; network affects only bech32 encoding).
    if (!verifyBip322P2wpkhSimple(messageBytes, pubkey, encodedSignature)) {
      throw new Error(
        "proof of possession signature does not verify against the depositor key",
      );
    }
    return { kind: "p2wpkh-verified" };
  }

  throw new Error(
    `proof of possession witness has ${items.length} items; expected 1 (P2TR) or 2 (P2WPKH)`,
  );
}
