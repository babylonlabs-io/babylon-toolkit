/**
 * Golden-vector test for the server-identity CBOR encoder.
 *
 * The expected payload is emitted by running the Rust reference
 * (`btc-vault/crates/btc-auth/src/server_identity.rs::build_server_identity_payload`)
 * via ciborium with deterministic inputs. If this test fails, either
 * the ciborium encoding behavior changed or our encoder no longer
 * matches — either way, signature verification against real VP
 * responses will break, so the failure is load-bearing.
 *
 * Canonical hex lives in `./goldenVectors.ts` so that all
 * server-identity tests share one source of truth and can't drift.
 */

import { describe, expect, it } from "vitest";

import { encodeServerIdentityPayload } from "../cbor";
import {
  GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED,
  GOLDEN_EXPIRES_AT,
  GOLDEN_PAYLOAD_HEX,
} from "./goldenVectors";

const toHex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

const fromHex = (h: string) => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

describe("encodeServerIdentityPayload — Rust ciborium golden vector", () => {
  const DOMAIN = new TextEncoder().encode("btc-auth.server-identity.v1");

  it("matches the Rust reference byte-for-byte", () => {
    const actual = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    expect(toHex(actual)).toBe(GOLDEN_PAYLOAD_HEX);
  });

  it("is deterministic for the same inputs", () => {
    const a = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    const b = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    expect(toHex(a)).toBe(toHex(b));
  });

  it("changes when expires_at changes", () => {
    const a = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    const b = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT + 1,
    );
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it("changes when ephemeral_pubkey changes", () => {
    const altPubkey = "03" + "aa".repeat(32);
    const a = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
      GOLDEN_EXPIRES_AT,
    );
    const b = encodeServerIdentityPayload(
      DOMAIN,
      fromHex(altPubkey),
      GOLDEN_EXPIRES_AT,
    );
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it("rejects non-safe-integer expires_at", () => {
    expect(() =>
      encodeServerIdentityPayload(
        DOMAIN,
        fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
        Number.NaN,
      ),
    ).toThrow(/safe integer/);
    expect(() =>
      encodeServerIdentityPayload(
        DOMAIN,
        fromHex(GOLDEN_EPHEMERAL_PUBKEY_COMPRESSED),
        -1,
      ),
    ).toThrow(/safe integer/);
  });
});
