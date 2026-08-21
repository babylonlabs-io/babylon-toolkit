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
 * 0.0.10 accepts in `verify.rs:213-236`). P2WPKH witnesses pass through
 * UNVERIFIED for now (follow-up: a P2WPKH BIP-322 verifier mirroring
 * `message.rs:107-133`); the verdict says so.
 *
 * @module managers/pegin/verifyPopWitness
 */

import { Buffer } from "buffer";
import { decodeWitnessStack } from "../../utils/witness/witnessStack";
import type { Hex } from "viem";

import { verifyBip322Simple } from "../../clients/vault-provider/auth/bip322Verify";

const P2TR_WITNESS_ITEMS = 1;
const P2WPKH_WITNESS_ITEMS = 2;
/** SEC1 compressed pubkey: 0x02/0x03 prefix + 32-byte x coordinate. */
const COMPRESSED_PUBKEY_BYTES = 33;
const SCHNORR_SIG_BYTES = 64;
/** BIP-341 hash types: 0x00 default (64-byte sig), 0x01 ALL (65-byte sig with trailing type byte). */
const SIGHASH_DEFAULT = 0x00;
const SIGHASH_ALL = 0x01;

const X_ONLY_PUBKEY_HEX = /^[0-9a-f]{64}$/i;
/** `normalizePopSignature` hands us 0x-prefixed lowercase hex; hold it to that. */
const WITNESS_BODY_HEX = /^(?:[0-9a-f]{2})+$/;

export type PopWitnessVerdict =
  | { readonly kind: "p2tr-verified" }
  | { readonly kind: "p2wpkh-unverified" };

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
 * Decode a consensus-encoded PoP witness and, for the P2TR shape, verify the
 * Schnorr signature against the depositor's key.
 *
 * @param messageBytes     - Bytes of the PoP message that was signed.
 * @param depositorXOnlyHex - Depositor x-only pubkey, bare 64-char hex
 *                            (enforced, not assumed).
 * @param witnessHex       - 0x-prefixed consensus-encoded witness.
 * @throws If the witness is malformed, has an unsupported item count, the
 *         depositor key is not bare x-only hex, or the P2TR signature does
 *         not verify.
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
    // Signature verification is deferred (#2284), but vaultd's FIRST check is
    // a plain pubkey compare (btc-vault crates/btc-signer/src/message.rs:110-123,
    // WitnessPubkeyMismatch): witness item 1 must be the depositor's compressed
    // key. Mirror it here — it needs no crypto and catches a wrong-account
    // signature before it becomes a permanent InvalidDepositorPop.
    if (!X_ONLY_PUBKEY_HEX.test(depositorXOnlyHex)) {
      throw new Error(
        `depositor public key must be bare 64-char x-only hex, got "${depositorXOnlyHex}"`,
      );
    }
    const pubkey = items[1];
    if (
      pubkey.length !== COMPRESSED_PUBKEY_BYTES ||
      (pubkey[0] !== 0x02 && pubkey[0] !== 0x03)
    ) {
      throw new Error(
        `proof of possession P2WPKH witness item 1 is not a compressed public key ` +
          `(${pubkey.length} bytes, prefix 0x${pubkey[0]?.toString(16) ?? "none"})`,
      );
    }
    const witnessXOnlyHex = Buffer.from(pubkey.subarray(1)).toString("hex");
    if (witnessXOnlyHex !== depositorXOnlyHex.toLowerCase()) {
      throw new Error(
        `proof of possession witness pubkey does not match the depositor key: ` +
          `witness carries ${witnessXOnlyHex}, expected ${depositorXOnlyHex}`,
      );
    }
    return { kind: "p2wpkh-unverified" };
  }

  throw new Error(
    `proof of possession witness has ${items.length} items; expected 1 (P2TR) or 2 (P2WPKH)`,
  );
}
