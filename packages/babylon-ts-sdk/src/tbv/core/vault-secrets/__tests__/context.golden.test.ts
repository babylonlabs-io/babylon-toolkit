/**
 * Cross-implementation golden vectors for `buildFundingOutpointsCommitment`
 * and `buildVaultContext`.
 *
 * Pins the byte-level encoding (in particular, the **big-endian** vout
 * encoding inside each serialized outpoint and the `I2OSP(32, 4)` length
 * prefix in `vaultContext`) against an independent Rust implementation
 * derived directly from the spec
 * (`docs/specs/derive-vault-secrets.md` §2.3) — addressing Govard's P1
 * review on PR babylonlabs-io/babylon-toolkit#1458.
 *
 * ## Reproduction recipe (Rust side)
 *
 * The Rust hex constants below were produced by a temporary
 * `#[cfg(test)] mod golden_vault_context` block added to
 * `~/babylon/btc-vault/crates/crypto/src/hash.rs` that re-implements the
 * spec from scratch (no shared code path with the TS impl) using
 * `sha2::Sha256` and `u32::to_be_bytes()`. The block was reverted from
 * btc-vault after capture; recreate it (or any equivalent independent
 * implementation) and run:
 *
 * ```
 * cargo test --manifest-path /path/to/btc-vault/Cargo.toml \
 *   -p btc-vault-crypto --lib \
 *   hash::golden_vault_context::print_golden_hex \
 *   -- --nocapture --exact
 * ```
 *
 * If the Rust side switches to little-endian for `vout`, this test
 * fails — surfacing the cross-impl divergence the PR review asked us
 * to lock down.
 */

import { describe, expect, it } from "vitest";

import {
  buildFundingOutpointsCommitment,
  buildVaultContext,
  type FundingOutpoint,
} from "../context";

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// Deterministic input fixture (matches the Rust reproduction).
//
// Three funding outpoints with txids 0x10.., 0x20.., 0x30.. and vouts
// 0, 1, 0x10000. The 0x10000 vout exercises multi-byte u32 encoding so
// big-endian vs little-endian byte ordering surfaces in the digest.
// Inputs are passed in the order (b, c, a) so the canonical lex sort
// rearranges them before hashing — exercising the canonicalization
// path on both sides.
const DEPOSITOR_PUBKEY = new Uint8Array(32).fill(0x02);
const TXID_A = new Uint8Array(32).fill(0x10);
const TXID_B = new Uint8Array(32).fill(0x20);
const TXID_C = new Uint8Array(32).fill(0x30);

const OUTPOINTS: readonly FundingOutpoint[] = [
  { txid: TXID_B, vout: 1 },
  { txid: TXID_C, vout: 0x10000 },
  { txid: TXID_A, vout: 0 },
];

// Hex outputs captured from the independent Rust implementation.
const RUST_COMMITMENT_HEX =
  "0d3303af2d3c17ce3bba8bc639fa74f30a81e6a585745c7f461550b2780590e9";
const RUST_VAULT_CONTEXT_HEX =
  "000000200202020202020202020202020202020202020202020202020202020202020202" +
  "000000200d3303af2d3c17ce3bba8bc639fa74f30a81e6a585745c7f461550b2780590e9";

describe("vault-secrets/context cross-impl goldens (PR #1458)", () => {
  it("buildFundingOutpointsCommitment matches the Rust reference", () => {
    const commitment = buildFundingOutpointsCommitment(OUTPOINTS);
    expect(toHex(commitment)).toBe(RUST_COMMITMENT_HEX);
  });

  it("buildVaultContext matches the Rust reference (72 bytes, BE vout, I2OSP length prefix)", () => {
    const ctx = buildVaultContext({
      depositorBtcPubkey: DEPOSITOR_PUBKEY,
      fundingOutpoints: OUTPOINTS,
    });
    expect(ctx.length).toBe(72);
    expect(toHex(ctx)).toBe(RUST_VAULT_CONTEXT_HEX);
  });
});
