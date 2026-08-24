/**
 * Host-side PoP witness checks.
 *
 * The P2TR cases reuse the BIP-322 golden vector emitted by the Rust
 * reference (`btc-vault/crates/btc-auth/src/server_identity.rs`, signer
 * seed 7); the P2WPKH cases use BIP-322's official test vectors — so a
 * passing test proves the witness path feeds the verifiers exactly what
 * a real signer produced.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import {
  BIP322_P2WPKH_HELLO_WORLD_WITNESS_HEX,
  BIP322_P2WPKH_PUBKEY_XONLY_HEX,
} from "../../../clients/vault-provider/auth/__tests__/bip322P2wpkhVectors";
import {
  GOLDEN_PAYLOAD_HEX,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "../../../clients/vault-provider/auth/__tests__/goldenVectors";
import { verifyPopWitness } from "../verifyPopWitness";

const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

const HELLO_WORLD = new TextEncoder().encode("Hello World");
const HELLO_WORLD_WITNESS =
  `0x${BIP322_P2WPKH_HELLO_WORLD_WITNESS_HEX}` as const;

describe("verifyPopWitness", () => {
  it("verifies a one-item P2TR witness (0x01 0x40 ‖ sig) against the BIP-322 golden vector", () => {
    const witness = `0x0140${GOLDEN_SIGNATURE_HEX}` as const;

    expect(
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        witness,
      ),
    ).toEqual({ kind: "p2tr-verified" });
  });

  it("throws when the P2TR signature does not verify", () => {
    const tampered =
      GOLDEN_SIGNATURE_HEX.slice(0, -2) +
      (GOLDEN_SIGNATURE_HEX.endsWith("00") ? "01" : "00");

    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x0140${tampered}`,
      ),
    ).toThrow(/proof of possession signature does not verify/);
  });

  it("accepts the 65-byte SIGHASH_ALL form only with a trailing 0x01 and verifies it under SIGHASH_ALL", () => {
    // The golden signature is SIGHASH_DEFAULT, so appending 0x01 must FAIL
    // verification (different digest) rather than be rejected for its length —
    // that is what proves the SIGHASH_ALL branch is the one taken.
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x0141${GOLDEN_SIGNATURE_HEX}01`,
      ),
    ).toThrow(/does not verify/);

    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x0141${GOLDEN_SIGNATURE_HEX}02`,
      ),
    ).toThrow(/64-byte Schnorr signature/);
  });

  it("throws on a non-minimal CompactSize length", () => {
    // rust-bitcoin's VarInt decoder returns NonMinimalVarInt for these, so
    // vaultd would reject the witness permanently at ingestion.
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x01fd4000${GOLDEN_SIGNATURE_HEX}`,
      ),
    ).toThrow(/non-minimal/);

    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x01fe40000000${GOLDEN_SIGNATURE_HEX}`,
      ),
    ).toThrow(/non-minimal/);
  });

  it("throws when the witness is not even-length lowercase hex", () => {
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x0140${GOLDEN_SIGNATURE_HEX.slice(0, -2)}zz`,
      ),
    ).toThrow(/even-length lowercase hex/);
  });

  it("throws when the depositor key is not bare x-only hex", () => {
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        `0x${GOLDEN_SIGNING_KEY_XONLY}`,
        `0x0140${GOLDEN_SIGNATURE_HEX}`,
      ),
    ).toThrow(/bare 64-char x-only hex/);
  });

  it("verifies a two-item P2WPKH witness against the BIP-322 official vector", () => {
    expect(
      verifyPopWitness(
        HELLO_WORLD,
        BIP322_P2WPKH_PUBKEY_XONLY_HEX,
        HELLO_WORLD_WITNESS,
      ),
    ).toEqual({ kind: "p2wpkh-verified" });
  });

  it("throws when the P2WPKH signature does not verify", () => {
    // Flip one byte inside the DER r value (witness hex offset: 2-item
    // marker + length byte + DER header land the r bytes well past index 8).
    const tampered =
      HELLO_WORLD_WITNESS.slice(0, 20) +
      (HELLO_WORLD_WITNESS[20] === "0" ? "1" : "0") +
      HELLO_WORLD_WITNESS.slice(21);
    expect(() =>
      verifyPopWitness(
        HELLO_WORLD,
        BIP322_P2WPKH_PUBKEY_XONLY_HEX,
        tampered as `0x${string}`,
      ),
    ).toThrow(/proof of possession signature does not verify/);
  });

  it("throws when the message differs from the one signed", () => {
    expect(() =>
      verifyPopWitness(
        new TextEncoder().encode("Hello World!"),
        BIP322_P2WPKH_PUBKEY_XONLY_HEX,
        HELLO_WORLD_WITNESS,
      ),
    ).toThrow(/proof of possession signature does not verify/);
  });

  it("rejects a valid witness whose embedded pubkey is not the depositor's", () => {
    // Mirrors vaultd's WitnessPubkeyMismatch (message.rs:117-123): a VALID
    // signature from the wrong account must surface as the pubkey-mismatch
    // failure, not as an invalid signature.
    expect(() =>
      verifyPopWitness(HELLO_WORLD, "22".repeat(32), HELLO_WORLD_WITNESS),
    ).toThrow(/does not match the depositor key/);
  });

  it("rejects a two-item witness whose item 1 is not a compressed pubkey", () => {
    // 32-byte item (x-only, no SEC1 prefix) in the pubkey slot.
    const badWitness: `0x${string}` = `0x02${"47"}${"11".repeat(71)}${"20"}${"22".repeat(32)}`;
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        badWitness,
      ),
    ).toThrow(/not a compressed public key/);
  });

  it("rejects a two-item witness whose pubkey is not a point on secp256k1", () => {
    // Correct shape (33 bytes, 0x02 prefix) but x ≥ the field prime —
    // vaultd rejects it at CompressedPublicKey::from_slice (message.rs:111-116).
    const notAPoint: `0x${string}` = `0x02${"47"}${"11".repeat(71)}${"21"}${"02" + "ff".repeat(32)}`;
    expect(() =>
      verifyPopWitness(fromHex(GOLDEN_PAYLOAD_HEX), "ff".repeat(32), notAPoint),
    ).toThrow(/not a valid secp256k1 point/);
  });

  it("throws on a witness with any other item count or a truncated item", () => {
    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        "0x00",
      ),
    ).toThrow(/witness/);

    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        "0x0140aabb",
      ),
    ).toThrow(/witness/);

    expect(() =>
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        `0x0140${GOLDEN_SIGNATURE_HEX}ff`,
      ),
    ).toThrow(/witness/);
  });
});
