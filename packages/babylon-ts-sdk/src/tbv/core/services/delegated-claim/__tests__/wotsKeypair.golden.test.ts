/**
 * Golden-vector gate for the WOTS keypair derivation the delegated claim
 * depends on. The derivation binds on-chain through `depositorWotsPkHash`:
 * if these bytes drift, every existing depositor loses the ability to prove
 * the keypair the graph's Claim commits to, and with it their claim path.
 *
 * The same vector is pinned Rust-side in vault-wasm `lib.rs` and in btc-vault
 * `crates/crypto`. A vault-wasm re-pin that changes it must not ship.
 */

import { describe, expect, it } from "vitest";

import { wotsKeypairFromSeed } from "../../../wasm";

// The fixed [0x42; 64] seed vault-wasm pins.
const GOLDEN_SEED = new Uint8Array(64).fill(0x42);

describe("wotsKeypairFromSeed frozen derivation", () => {
  it("derives the pinned pk_hash for the golden seed", async () => {
    const derivation = await wotsKeypairFromSeed(GOLDEN_SEED);

    expect(derivation.pk_hash).toBe(
      "0xb0ad6df0a215098862d287c9b39ba00ba06be3ee361c4bc65ba6d813f83a78f2",
    );
  });

  it("returns both the secret keypair and its public side", async () => {
    const derivation = await wotsKeypairFromSeed(GOLDEN_SEED);

    expect(derivation.keypair).toBeTruthy();
    expect(derivation.public_keys).toBeTruthy();
  });

  it("rejects a seed that is not 64 bytes", async () => {
    await expect(wotsKeypairFromSeed(new Uint8Array(32))).rejects.toThrow(
      /64 bytes/,
    );
  });
});
