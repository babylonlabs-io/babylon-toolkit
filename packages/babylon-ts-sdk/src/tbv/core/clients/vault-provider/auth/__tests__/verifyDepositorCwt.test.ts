import { describe, expect, it } from "vitest";

import {
  CWT_SUBJECT_GRPC,
  CWT_SUBJECT_JSONRPC,
  type CwtVerificationReason,
  CwtVerificationError,
  type VerifyDepositorCwtInput,
  verifyDepositorCwt,
} from "../verifyDepositorCwt";

import {
  GOLDEN_CWT_AUDIENCE_XONLY,
  GOLDEN_CWT_EXP,
  GOLDEN_CWT_NBF,
  GOLDEN_CWT_SHORT_EXP,
  GOLDEN_CWT_TOKEN_GRPC,
  GOLDEN_CWT_TOKEN_JSONRPC,
  GOLDEN_CWT_TOKEN_JSONRPC_SHORT,
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_SIGNING_KEY_XONLY,
} from "./goldenVectors";
import {
  ALG_ES256K,
  MINT_EPHEMERAL_PUBKEY_COMPRESSED,
  type MintCwtOptions,
  mintTestCwt,
} from "./mintTestCwt";

// Wall clock chosen between the tokens' nbf (GOLDEN_CWT_NBF) and exp
// (GOLDEN_CWT_EXP), and within the server identity's lifetime.
const NOW = 1_699_997_000;

function baseInput(
  overrides: Partial<VerifyDepositorCwtInput> = {},
): VerifyDepositorCwtInput {
  return {
    token: GOLDEN_CWT_TOKEN_JSONRPC,
    ephemeralPubkeyHex: GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
    expectedIssuerXOnlyPubkey: GOLDEN_SIGNING_KEY_XONLY,
    expectedSubject: CWT_SUBJECT_JSONRPC,
    expectedAudienceXOnlyPubkey: GOLDEN_CWT_AUDIENCE_XONLY,
    responseExpiresAt: GOLDEN_CWT_EXP,
    serverIdentityExpiresAt: GOLDEN_EXPIRES_AT,
    now: NOW,
    ...overrides,
  };
}

function expectReason(
  input: VerifyDepositorCwtInput,
  reason: CwtVerificationReason,
): void {
  try {
    verifyDepositorCwt(input);
  } catch (error) {
    expect(error).toBeInstanceOf(CwtVerificationError);
    expect((error as CwtVerificationError).reason).toBe(reason);
    return;
  }
  throw new Error(`expected verifyDepositorCwt to throw ${reason}`);
}

describe("verifyDepositorCwt", () => {
  it("verifies a genuine JSON-RPC-subject token and returns its claims", () => {
    const claims = verifyDepositorCwt(baseInput());

    expect(claims.issuer.toLowerCase()).toBe(GOLDEN_SIGNING_KEY_XONLY);
    expect(claims.subject).toBe(CWT_SUBJECT_JSONRPC);
    expect(claims.audience).toBe(GOLDEN_CWT_AUDIENCE_XONLY);
    expect(claims.expiresAt).toBe(GOLDEN_CWT_EXP);
    expect(claims.notBefore).toBe(GOLDEN_CWT_NBF);
    expect(claims.issuedAt).toBe(GOLDEN_CWT_NBF);
  });

  it("verifies a genuine gRPC-subject token", () => {
    const claims = verifyDepositorCwt(
      baseInput({
        token: GOLDEN_CWT_TOKEN_GRPC,
        expectedSubject: CWT_SUBJECT_GRPC,
      }),
    );
    expect(claims.subject).toBe(CWT_SUBJECT_GRPC);
  });

  it("rejects a token whose signature has been tampered with", () => {
    // Flip one base64url char well inside the trailing COSE signature
    // (the final char carries non-significant bits, so avoid it).
    const index = GOLDEN_CWT_TOKEN_JSONRPC.length - 10;
    const original = GOLDEN_CWT_TOKEN_JSONRPC[index];
    const replacement = original === "A" ? "B" : "A";
    const tampered =
      GOLDEN_CWT_TOKEN_JSONRPC.slice(0, index) +
      replacement +
      GOLDEN_CWT_TOKEN_JSONRPC.slice(index + 1);
    expect(tampered).not.toBe(GOLDEN_CWT_TOKEN_JSONRPC);
    expectReason(
      baseInput({ token: tampered }),
      "signature_verification_failed",
    );
  });

  it("rejects a token verified against the wrong ephemeral key", () => {
    // Same x-coordinate, flipped parity prefix → a different valid point.
    const wrongEphemeral =
      "03" + GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED.slice(2);
    expectReason(
      baseInput({ ephemeralPubkeyHex: wrongEphemeral }),
      "signature_verification_failed",
    );
  });

  it("rejects a token whose issuer is not the pinned server pubkey", () => {
    expectReason(
      baseInput({ expectedIssuerXOnlyPubkey: "a".repeat(64) }),
      "issuer_mismatch",
    );
  });

  it("rejects a JSON-RPC token presented for the gRPC subject", () => {
    expectReason(
      baseInput({ expectedSubject: CWT_SUBJECT_GRPC }),
      "subject_mismatch",
    );
  });

  it("rejects a token minted for a different depositor", () => {
    expectReason(
      baseInput({ expectedAudienceXOnlyPubkey: "b".repeat(64) }),
      "audience_mismatch",
    );
  });

  it("rejects a token that is not yet valid", () => {
    expectReason(baseInput({ now: GOLDEN_CWT_NBF - 1 }), "token_not_yet_valid");
  });

  it("rejects an expired token", () => {
    expectReason(baseInput({ now: GOLDEN_CWT_EXP }), "token_expired");
  });

  it("rejects when the wire expires_at disagrees with the token exp", () => {
    expectReason(
      baseInput({ responseExpiresAt: GOLDEN_CWT_EXP + 1 }),
      "expiry_mismatch",
    );
  });

  it("rejects when the server identity expires before the token", () => {
    expectReason(
      baseInput({ serverIdentityExpiresAt: GOLDEN_CWT_EXP - 1 }),
      "server_identity_expires_before_token",
    );
  });

  it("verifies the short-lived token only within its window", () => {
    const claims = verifyDepositorCwt(
      baseInput({
        token: GOLDEN_CWT_TOKEN_JSONRPC_SHORT,
        responseExpiresAt: GOLDEN_CWT_SHORT_EXP,
        now: GOLDEN_CWT_SHORT_EXP - 1,
      }),
    );
    expect(claims.expiresAt).toBe(GOLDEN_CWT_SHORT_EXP);

    expectReason(
      baseInput({
        token: GOLDEN_CWT_TOKEN_JSONRPC_SHORT,
        responseExpiresAt: GOLDEN_CWT_SHORT_EXP,
        now: GOLDEN_CWT_SHORT_EXP,
      }),
      "token_expired",
    );
  });

  it("rejects a structurally invalid token", () => {
    // Valid base64url, but the bytes are not a COSE Sign1 tagged value.
    expectReason(baseInput({ token: "AA" }), "invalid_token_structure");
  });

  it("rejects a token with invalid base64url characters", () => {
    expectReason(
      baseInput({ token: "not valid base64url!!" }),
      "invalid_token_structure",
    );
  });

  it("rejects a malformed expected issuer pubkey", () => {
    expectReason(
      baseInput({ expectedIssuerXOnlyPubkey: "xyz" }),
      "invalid_input",
    );
  });
});

// The genuine golden tokens are signed by the Rust issuer's key, so they
// can only reach the checks that run *before* signature verification.
// These cases mint a token with a test signing key (and hand the verifier
// the matching ephemeral pubkey) so the signature genuinely verifies and
// the post-signature claim-rejection paths become reachable.
describe("verifyDepositorCwt — crafted negative tokens", () => {
  const MINT_ISS = GOLDEN_SIGNING_KEY_XONLY;
  const MINT_AUD = GOLDEN_CWT_AUDIENCE_XONLY;
  const MINT_NOW = 1_700_000_000;
  /** COSE alg id for ES256 (secp256r1) — a valid alg, but not the ES256K we pin. */
  const ALG_ES256 = -7;

  function mintedInput(
    claims: Partial<MintCwtOptions> = {},
  ): VerifyDepositorCwtInput {
    const exp = claims.exp ?? MINT_NOW + 1000;
    const token = mintTestCwt({
      alg: ALG_ES256K,
      iss: MINT_ISS,
      sub: CWT_SUBJECT_JSONRPC,
      aud: MINT_AUD,
      exp,
      nbf: MINT_NOW - 1000,
      iat: MINT_NOW - 1000,
      ...claims,
    });
    return {
      token,
      ephemeralPubkeyHex: MINT_EPHEMERAL_PUBKEY_COMPRESSED,
      expectedIssuerXOnlyPubkey: MINT_ISS,
      expectedSubject: CWT_SUBJECT_JSONRPC,
      expectedAudienceXOnlyPubkey: MINT_AUD,
      responseExpiresAt: exp,
      serverIdentityExpiresAt: exp,
      now: MINT_NOW,
    };
  }

  it("accepts a token minted with the test signing key (minter sanity)", () => {
    const claims = verifyDepositorCwt(mintedInput());
    expect(claims.audience).toBe(MINT_AUD);
    expect(claims.subject).toBe(CWT_SUBJECT_JSONRPC);
  });

  it("rejects a token whose protected header pins a non-ES256K algorithm", () => {
    expectReason(mintedInput({ alg: ALG_ES256 }), "unexpected_algorithm");
  });

  it("rejects a token whose signature is not 64 bytes", () => {
    expectReason(mintedInput({ sigLenOverride: 63 }), "invalid_token_structure");
  });

  it("rejects a token whose aud is not a 32-byte x-only pubkey", () => {
    expectReason(mintedInput({ aud: "not-a-pubkey" }), "invalid_claims");
  });

  it("rejects a token whose iat is after its exp", () => {
    expectReason(
      mintedInput({ exp: MINT_NOW + 1000, iat: MINT_NOW + 1001 }),
      "invalid_claims",
    );
  });

  it("rejects a token issued in the future (iat > now)", () => {
    expectReason(mintedInput({ iat: MINT_NOW + 1 }), "invalid_claims");
  });

  it("rejects a token with an empty cti", () => {
    expectReason(mintedInput({ cti: new Uint8Array(0) }), "invalid_claims");
  });

  it("rejects a token with trailing bytes after the COSE Sign1 structure", () => {
    // Append a stray byte to an otherwise-valid minted token. base64url of
    // the extra byte decodes to trailing bytes the verifier must reject.
    const valid = mintTestCwt({
      alg: ALG_ES256K,
      iss: MINT_ISS,
      sub: CWT_SUBJECT_JSONRPC,
      aud: MINT_AUD,
      exp: MINT_NOW + 1000,
      nbf: MINT_NOW - 1000,
      iat: MINT_NOW - 1000,
    });
    const tokenBytes = Buffer.from(
      valid.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );
    const withTrailer = Buffer.concat([tokenBytes, Buffer.of(0x00)])
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expectReason(
      {
        token: withTrailer,
        ephemeralPubkeyHex: MINT_EPHEMERAL_PUBKEY_COMPRESSED,
        expectedIssuerXOnlyPubkey: MINT_ISS,
        expectedSubject: CWT_SUBJECT_JSONRPC,
        expectedAudienceXOnlyPubkey: MINT_AUD,
        responseExpiresAt: MINT_NOW + 1000,
        serverIdentityExpiresAt: MINT_NOW + 1000,
        now: MINT_NOW,
      },
      "invalid_token_structure",
    );
  });
});
