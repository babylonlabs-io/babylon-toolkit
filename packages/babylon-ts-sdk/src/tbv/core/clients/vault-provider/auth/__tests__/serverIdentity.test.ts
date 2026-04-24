import { describe, expect, it } from "vitest";

import {
  ServerIdentityError,
  type ServerIdentityResponse,
  verifyServerIdentity,
} from "../serverIdentity";

const PINNED = "a".repeat(64);
const NOW = 1_700_000_000;

function validProof(
  overrides: Partial<ServerIdentityResponse> = {},
): ServerIdentityResponse {
  return {
    server_pubkey: PINNED,
    ephemeral_pubkey: "02" + "b".repeat(64),
    expires_at: NOW + 3600,
    signature: "c".repeat(128),
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

  it("accepts ephemeral pubkey with 0x03 prefix", () => {
    expect(() =>
      verifyServerIdentity({
        proof: validProof({ ephemeral_pubkey: "03" + "b".repeat(64) }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      }),
    ).not.toThrow();
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
  // the expiry check.
  it("rejects non-integer expires_at (NaN)", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: Number.NaN as unknown as number }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });

  it("rejects undefined expires_at", () => {
    try {
      verifyServerIdentity({
        proof: validProof({ expires_at: undefined as unknown as number }),
        pinnedServerPubkey: PINNED,
        now: NOW,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });

  it("rejects string expires_at (unsafe coercion)", () => {
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
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });

  it("rejects non-integer now", () => {
    try {
      verifyServerIdentity({
        proof: validProof(),
        pinnedServerPubkey: PINNED,
        now: Number.NaN as unknown as number,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as ServerIdentityError).reason).toBe("expired");
    }
  });
});
