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
import {
  computeWotsBlockPublicKeysHash,
  deriveWotsBlocksFromSeed,
} from "../../../wots/blockDerivation";

// The fixed [0x42; 64] seed vault-wasm pins.
const GOLDEN_SEED = new Uint8Array(64).fill(0x42);

describe("wotsKeypairFromSeed frozen derivation", () => {
  it("derives the pinned pk_hash for the golden seed", async () => {
    const derivation = await wotsKeypairFromSeed(GOLDEN_SEED);

    expect(derivation.pk_hash).toBe(
      "0xb0ad6df0a215098862d287c9b39ba00ba06be3ee361c4bc65ba6d813f83a78f2",
    );
  });

  it("agrees with the deposit-time TS derivation for the same seed", async () => {
    // Deposit time commits `depositorWotsPkHash` through the TS path; claim
    // time re-derives it through wasm. Two implementations of one on-chain
    // value, so the value only binds while they agree. Both zero the seed
    // they are handed, hence the copies.
    const [blocks, derivation] = await Promise.all([
      deriveWotsBlocksFromSeed(GOLDEN_SEED.slice()),
      wotsKeypairFromSeed(GOLDEN_SEED.slice()),
    ]);

    expect(computeWotsBlockPublicKeysHash(blocks)).toBe(derivation.pk_hash);
  });

  it("agrees with the deposit-time TS derivation for random seeds", async () => {
    // The fixed vector pins one input. The binding that matters is that the
    // two implementations of depositorWotsPkHash agree on every input, so
    // this drives them both over seeds neither side has ever seen.
    const RANDOM_SEED_COUNT = 16;
    for (let i = 0; i < RANDOM_SEED_COUNT; i++) {
      const seed = crypto.getRandomValues(new Uint8Array(64));
      const [blocks, derivation] = await Promise.all([
        deriveWotsBlocksFromSeed(seed.slice()),
        wotsKeypairFromSeed(seed.slice()),
      ]);

      expect(computeWotsBlockPublicKeysHash(blocks)).toBe(derivation.pk_hash);
    }
  });

  it("rejects a seed that is not 64 bytes", async () => {
    await expect(wotsKeypairFromSeed(new Uint8Array(32))).rejects.toThrow(
      /64 bytes/,
    );
  });
});
