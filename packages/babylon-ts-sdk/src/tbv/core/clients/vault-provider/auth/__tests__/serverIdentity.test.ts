import { describe, expect, it } from "vitest";

import {
  ServerIdentityError,
  type ServerIdentityResponse,
  verifyServerIdentity,
} from "../serverIdentity";

import {
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_SIGNATURE_HEX,
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";

// Real curve-point fixtures: happy-path tests must use these so
// BIP-322 verify resolves to `true`. Tests that exercise structural
// rejections (wrong length, mismatch, expired, bad hex) can use
// arbitrary fixtures since those checks fire before crypto.
const PINNED = GOLDEN_SIGNING_KEY_XONLY;
const NOW = GOLDEN_EXPIRES_AT - 3600; // 1 hour before proof expires

function validProof(
  overrides: Partial<ServerIdentityResponse> = {},
): ServerIdentityResponse {
  return {
    server_pubkey: PINNED,
    ephemeral_pubkey: GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
    expires_at: GOLDEN_EXPIRES_AT,
    signature: GOLDEN_SIGNATURE_HEX,
    ...overrides,
  };
}

describe("verifyServerIdentity", () => {
  it("accepts a well-formed proof matching the pinned pubkey", () => {
    expect(() =>
      verifyServerIdentity({
        proof: validProof(),
        pinnedServerPubkey: PINNED,
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("accepts 0x-prefixed pinned pubkey and proof pubkey", () => {
    expect(() =>
      verifyServerIdentity({
        proof: validProof({ server_pubkey: "0x" + PINNED }),
        pinnedServerPubkey: "0x" + PINNED,
        now: NOW,
      }),
    ).not.toThrow();
  });

  // The 03 prefix is structurally valid (compressed pubkey, odd-Y).
  // We reuse the golden ephemeral's x-coordinate but flip the parity
  // byte to 03 — the resulting (x, -y) is on-curve, so this point
  // passes both the prefix check and the secp256k1 isPoint check.
  // Crypto verify then fails because the signature is over the 02
  // ephemeral, proving the prefix gate itself accepted 03.
  it("accepts 03-prefix ephemeral pubkey structurally (fails later at crypto)", () => {
    const onCurve03 = "03" + GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED.slice(2);
    try {
      verifyServerIdentity({
        proof: validProof({ ephemeral_pubkey: onCurve03 }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "signature_verification_failed",
      );
    }
  });

  it("rejects ephemeral pubkey not on the secp256k1 curve", () => {
    // Structurally a compressed pubkey (33 bytes, 02/03 prefix, hex)
    // but the x-coordinate is not on the curve.
    try {
      verifyServerIdentity({
        proof: validProof({ ephemeral_pubkey: "02" + "00".repeat(32) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "invalid_ephemeral_pubkey",
      );
    }
  });

  it("rejects pubkey mismatch", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ server_pubkey: "d".repeat(64) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ServerIdentityError);
      expect((err as ServerIdentityError).reason).toBe(
        "pinned_pubkey_mismatch",
      );
    }
  });

  it("rejects an expired proof", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: NOW - 1 }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });

  it("rejects a proof at exactly expires_at (strict >)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: NOW }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });

  it("rejects wrong-length pinned pubkey", () => {
    expect(() =>
      verifyServerIdentity({
        proof: validProof(),
        pinnedServerPubkey: "a".repeat(62),
        now: NOW,
      }),
    ).toThrow(/pinnedServerPubkey/);
  });

  it("normalizes uppercase-hex pinned pubkey (case-insensitive match)", () => {
    expect(() =>
      verifyServerIdentity({
        proof: validProof({ server_pubkey: PINNED.toUpperCase() }),
        pinnedServerPubkey: PINNED.toUpperCase(),
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("rejects malformed ephemeral pubkey (wrong length)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ ephemeral_pubkey: "02" + "b".repeat(62) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "invalid_ephemeral_pubkey",
      );
    }
  });

  it("rejects ephemeral pubkey with unsupported prefix (uncompressed)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ ephemeral_pubkey: "04" + "b".repeat(64) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "invalid_ephemeral_pubkey",
      );
    }
  });

  it("rejects malformed signature (wrong length)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ signature: "c".repeat(126) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "invalid_signature_encoding",
      );
    }
  });

  it("rejects malformed signature (non-hex)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ signature: "z".repeat(128) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe(
        "invalid_signature_encoding",
      );
    }
  });

  // Guards against relational-comparison coercion bugs where
  // `undefined <= now` silently evaluates to `false` and bypasses
  // the expiry check. Garbage data is reported as `invalid_expires_at`
  // so a caller can tell "stale token, retry" from "wire payload is
  // malformed, do not retry".
  it("rejects non-integer expires_at (NaN) as invalid_expires_at", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: Number.NaN as unknown as number }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("invalid_expires_at");
    }
  });

  it("rejects undefined expires_at as invalid_expires_at", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: undefined as unknown as number }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("invalid_expires_at");
    }
  });

  it("rejects string expires_at (unsafe coercion) as invalid_expires_at", () => {
    try {
      verifyServerIdentity({
        proof: validProof({
          expires_at: String(NOW + 3600) as unknown as number,
        }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("invalid_expires_at");
    }
  });

  it("rejects non-integer now as invalid_expires_at", () => {
    try {
      verifyServerIdentity({
        proof: validProof(),
        pinnedServerPubkey: PINNED,
        now: Number.NaN as unknown as number,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("invalid_expires_at");
    }
  });
});
