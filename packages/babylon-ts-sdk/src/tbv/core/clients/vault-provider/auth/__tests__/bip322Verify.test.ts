/**
 * Golden-vector test for BIP-322 simple verify.
 *
 * The signature + message + pubkey are emitted by the Rust reference
 * in `btc-vault/crates/btc-auth/src/server_identity.rs`. The signer
 * seed is 7 and the payload is produced by
 * `build_server_identity_payload` with a seed-42 ephemeral pubkey
 * and expires_at = 1_700_000_000. These were generated end-to-end
 * by the Rust production path, not constructed ad-hoc — so if this
 * test passes, the TypeScript implementation byte-exactly matches
 * what a real VP would sign.
 *
 * Canonical hex lives in `./goldenVectors.ts` so that all
 * server-identity tests share one source of truth and can't drift.
 */

import { describe, expect, it } from "vitest";

import { verifyBip322Simple } from "../bip322Verify";
import { encodeServerIdentityPayload } from "../cbor";
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
});
