/**
 * Host-side PoP witness checks.
 *
 * The P2TR cases reuse the BIP-322 golden vector emitted by the Rust
 * reference (`btc-vault/crates/btc-auth/src/server_identity.rs`, signer
 * seed 7) so a passing test proves the witness path feeds the verifier
 * exactly what a real signer produced.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import {
  GOLDEN_PAYLOAD_HEX,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "../../../clients/vault-provider/auth/__tests__/goldenVectors";
import { verifyPopWitness } from "../verifyPopWitness";

const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

/** varint(2) ‖ varint(71) ‖ 71B DER sig ‖ varint(33) ‖ 33B compressed pubkey. */
const P2WPKH_WITNESS =
  `0x02${"47"}${"11".repeat(71)}${"21"}${"02" + "22".repeat(32)}` as const;

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

  it("passes a two-item P2WPKH witness through unverified (follow-up verifier)", () => {
    expect(
      verifyPopWitness(
        fromHex(GOLDEN_PAYLOAD_HEX),
        GOLDEN_SIGNING_KEY_XONLY,
        P2WPKH_WITNESS,
      ),
    ).toEqual({ kind: "p2wpkh-unverified" });
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
