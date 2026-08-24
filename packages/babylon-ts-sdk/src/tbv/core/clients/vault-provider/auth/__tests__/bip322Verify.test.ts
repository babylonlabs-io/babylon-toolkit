/**
 * Golden-vector tests for BIP-322 simple verify.
 *
 * P2TR: the signature + message + pubkey are emitted by the Rust
 * reference in `btc-vault/crates/btc-auth/src/server_identity.rs`.
 * The signer seed is 7 and the payload is produced by
 * `build_server_identity_payload` with a seed-42 ephemeral pubkey
 * and expires_at = 1_700_000_000. These were generated end-to-end
 * by the Rust production path, not constructed ad-hoc — so if this
 * test passes, the TypeScript implementation byte-exactly matches
 * what a real VP would sign.
 *
 * P2WPKH: the vectors are BIP-322's official ones, pinned in
 * `./bip322P2wpkhVectors.ts`.
 *
 * Canonical hex lives in `./goldenVectors.ts` / `./bip322P2wpkhVectors.ts`
 * so the suites share one source of truth and can't drift.
 */

import { Buffer } from "buffer";

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { sha256 } from "@noble/hashes/sha2.js";
import { script as bscript, payments, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { verifyBip322P2wpkhSimple, verifyBip322Simple } from "../bip322Verify";
import { encodeServerIdentityPayload } from "../cbor";
import {
  BIP322_P2WPKH_PUBKEY_HEX,
  BIP322_P2WPKH_SIGNATURES,
} from "./bip322P2wpkhVectors";
import {
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_PAYLOAD_HEX,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";

const fromHex = (h: string) => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

describe("verifyBip322Simple — Rust reference golden vector", () => {
  it("verifies the golden signature", () => {
    const ok = verifyBip322Simple(
      fromHex(GOLDEN_PAYLOAD_HEX),
      fromHex(GOLDEN_SIGNING_KEY_XONLY),
      fromHex(GOLDEN_SIGNATURE_HEX),
    );
    expect(ok).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const tamperedSig = fromHex(GOLDEN_SIGNATURE_HEX);
    tamperedSig[0] ^= 0x01; // flip one bit
    const ok = verifyBip322Simple(
      fromHex(GOLDEN_PAYLOAD_HEX),
      fromHex(GOLDEN_SIGNING_KEY_XONLY),
      tamperedSig,
    );
    expect(ok).toBe(false);
  });

  it("rejects a tampered message", () => {
    const tamperedMsg = fromHex(GOLDEN_PAYLOAD_HEX);
    tamperedMsg[tamperedMsg.length - 1] ^= 0x01;
    const ok = verifyBip322Simple(
      tamperedMsg,
      fromHex(GOLDEN_SIGNING_KEY_XONLY),
      fromHex(GOLDEN_SIGNATURE_HEX),
    );
    expect(ok).toBe(false);
  });

  it("rejects against the wrong pubkey", () => {
    const wrongKey = fromHex(GOLDEN_SIGNING_KEY_XONLY);
    wrongKey[0] ^= 0x01;
    const ok = verifyBip322Simple(
      fromHex(GOLDEN_PAYLOAD_HEX),
      wrongKey,
      fromHex(GOLDEN_SIGNATURE_HEX),
    );
    expect(ok).toBe(false);
  });

  it("rejects wrong-length pubkey", () => {
    const ok = verifyBip322Simple(
      fromHex(GOLDEN_PAYLOAD_HEX),
      new Uint8Array(31),
      fromHex(GOLDEN_SIGNATURE_HEX),
    );
    expect(ok).toBe(false);
  });

  it("rejects wrong-length signature", () => {
    const ok = verifyBip322Simple(
      fromHex(GOLDEN_PAYLOAD_HEX),
      fromHex(GOLDEN_SIGNING_KEY_XONLY),
      new Uint8Array(63),
    );
    expect(ok).toBe(false);
  });
});

describe("verifyBip322Simple — end-to-end via encodeServerIdentityPayload", () => {
  // Proves that encoding + verify compose correctly — the payload
  // passed to verify must be the exact bytes the encoder produces.
  it("verifies when payload is re-encoded from its raw inputs", () => {
    const domain = new TextEncoder().encode("btc-auth.server-identity.v1");
    const ephemeralPubkey = fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED);

    const payload = encodeServerIdentityPayload(
      domain,
      ephemeralPubkey,
      GOLDEN_EXPIRES_AT,
    );

    const signingKey = fromHex(GOLDEN_SIGNING_KEY_XONLY);
    const signature = fromHex(GOLDEN_SIGNATURE_HEX);

    expect(verifyBip322Simple(payload, signingKey, signature)).toBe(true);
  });

  it("refuses sighash types a BIP-322 witness may not carry", () => {
    // SIGHASH_NONE/SINGLE and the ANYONECANPAY variants are rejected
    // downstream, so verifying them here would report a false positive.
    const payload = encodeServerIdentityPayload(
      new TextEncoder().encode("btc-auth.server-identity.v1"),
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    const signingKey = fromHex(GOLDEN_SIGNING_KEY_XONLY);
    const signature = fromHex(GOLDEN_SIGNATURE_HEX);

    for (const hashType of [0x02, 0x03, 0x81, 0x82, 0x83]) {
      expect(verifyBip322Simple(payload, signingKey, signature, hashType)).toBe(
        false,
      );
    }
  });
});

const VECTOR_PUBKEY = fromHex(BIP322_P2WPKH_PUBKEY_HEX);
const utf8 = (s: string) => new TextEncoder().encode(s);

// In-test BIP-322 P2WPKH signer for cases the official vectors can't cover
// (wrong hashtype, short DER encoding). Reconstructs to_spend/to_sign per the
// BIP-322 spec ("simple" format); the official-vector tests above anchor that
// the production verifier follows the same construction.
const TEST_PRIV = Buffer.alloc(32, 0);
TEST_PRIV[31] = 1; // privkey 1 → pubkey G; public test material.
const TEST_PUB = Buffer.from(ecc.pointFromScalar(TEST_PRIV, true)!);

function bip322P2wpkhSighash(
  messageBytes: Uint8Array,
  pubkey: Buffer,
  hashType: number,
): Buffer {
  const th = Buffer.from(sha256(utf8("BIP0322-signed-message")));
  const messageHash = Buffer.from(
    sha256(Buffer.concat([th, th, Buffer.from(messageBytes)])),
  );
  const p2wpkh = payments.p2wpkh({ pubkey });
  const toSpend = new Transaction();
  toSpend.version = 0;
  toSpend.locktime = 0;
  toSpend.addInput(
    Buffer.alloc(32, 0),
    0xffffffff,
    0,
    Buffer.concat([Buffer.from([0x00, 0x20]), messageHash]),
  );
  toSpend.addOutput(p2wpkh.output!, 0);
  const toSign = new Transaction();
  toSign.version = 0;
  toSign.locktime = 0;
  toSign.addInput(toSpend.getHash(), 0, 0);
  toSign.addOutput(Buffer.from([0x6a]), 0);
  const scriptCode = payments.p2pkh({ hash: p2wpkh.hash! }).output!;
  return toSign.hashForWitnessV0(0, scriptCode, 0, hashType);
}

describe("verifyBip322P2wpkhSimple — BIP-322 official P2WPKH vectors", () => {
  it("accepts every official vector (both messages, 71- and 72-byte encodings)", () => {
    for (const { message, encodedSignatureHexes } of BIP322_P2WPKH_SIGNATURES) {
      for (const sigHex of encodedSignatureHexes) {
        expect(
          verifyBip322P2wpkhSimple(
            utf8(message),
            VECTOR_PUBKEY,
            fromHex(sigHex),
          ),
        ).toBe(true);
      }
    }
  });

  it("rejects a tampered signature byte", () => {
    const sig = fromHex(BIP322_P2WPKH_SIGNATURES[1].encodedSignatureHexes[0]);
    sig[10] ^= 0x01; // inside the DER r value
    expect(
      verifyBip322P2wpkhSimple(utf8("Hello World"), VECTOR_PUBKEY, sig),
    ).toBe(false);
  });

  it("rejects the right signature under a different pubkey", () => {
    expect(
      verifyBip322P2wpkhSimple(
        utf8("Hello World"),
        TEST_PUB, // valid compressed point, not the vector signer
        fromHex(BIP322_P2WPKH_SIGNATURES[1].encodedSignatureHexes[0]),
      ),
    ).toBe(false);
  });

  it("rejects the wrong message", () => {
    expect(
      verifyBip322P2wpkhSimple(
        utf8("Hello World!"),
        VECTOR_PUBKEY,
        fromHex(BIP322_P2WPKH_SIGNATURES[1].encodedSignatureHexes[0]),
      ),
    ).toBe(false);
  });

  it("rejects a trailing hashtype byte that is not SIGHASH_ALL", () => {
    for (const hashType of [0x00, 0x02, 0x03, 0x81]) {
      const sig = fromHex(BIP322_P2WPKH_SIGNATURES[1].encodedSignatureHexes[0]);
      sig[sig.length - 1] = hashType;
      expect(
        verifyBip322P2wpkhSimple(utf8("Hello World"), VECTOR_PUBKEY, sig),
      ).toBe(false);
    }
  });

  it("rejects a cryptographically valid SIGHASH_NONE signature (gate, not sig failure)", () => {
    // Signed over the real NONE sighash: without the explicit SIGHASH_ALL
    // gate (bip322 crate 0.0.10 verify.rs:156-161) this would verify.
    const message = utf8("sighash gate");
    const sighashNone = bip322P2wpkhSighash(message, TEST_PUB, 0x02);
    const encoded = bscript.signature.encode(
      Buffer.from(ecc.sign(sighashNone, TEST_PRIV)),
      0x02,
    );
    expect(verifyBip322P2wpkhSimple(message, TEST_PUB, encoded)).toBe(false);
  });

  it("rejects an encoded signature shorter than 71 bytes even when cryptographically valid", () => {
    // vaultd's verifier accepts ONLY 71/72-byte encodings (bip322 crate
    // 0.0.10 verify.rs:141-153), so a short-DER signature would fail
    // ingestion permanently — the host gate must reject it too. Grind the
    // sign entropy until r or s DER-encodes one byte short.
    const message = utf8("short der");
    const sighash = bip322P2wpkhSighash(message, TEST_PUB, 0x01);
    let shortEncoded: Buffer | undefined;
    for (let i = 0; i < 5000 && !shortEncoded; i++) {
      const entropy = Buffer.alloc(32, 0);
      entropy.writeUInt32LE(i, 0);
      const candidate = bscript.signature.encode(
        Buffer.from(ecc.sign(sighash, TEST_PRIV, entropy)),
        0x01,
      );
      if (candidate.length < 71) shortEncoded = candidate;
    }
    expect(shortEncoded).toBeDefined();
    // Sanity: the short signature IS valid ECDSA for this sighash.
    expect(
      ecc.verify(
        sighash,
        TEST_PUB,
        bscript.signature.decode(shortEncoded!).signature,
        true,
      ),
    ).toBe(true);
    expect(verifyBip322P2wpkhSimple(message, TEST_PUB, shortEncoded!)).toBe(
      false,
    );
  });

  it("rejects a pubkey that is not on the curve or not 33 bytes", () => {
    const sig = fromHex(BIP322_P2WPKH_SIGNATURES[0].encodedSignatureHexes[0]);
    const notAPoint = Buffer.concat([
      Buffer.from([0x02]),
      Buffer.alloc(32, 0xff), // x ≥ field prime — no point has this encoding
    ]);
    expect(verifyBip322P2wpkhSimple(utf8(""), notAPoint, sig)).toBe(false);
    expect(
      verifyBip322P2wpkhSimple(utf8(""), VECTOR_PUBKEY.subarray(1), sig),
    ).toBe(false);
  });
});
