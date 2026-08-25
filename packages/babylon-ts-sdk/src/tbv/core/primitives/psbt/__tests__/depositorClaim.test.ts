/**
 * Depositor-claim descriptor tests.
 *
 * CLAUDE.md critical path #9: this derivation mints the script a real Bitcoin
 * transaction is signed against, and it has no Rust counterpart to compare
 * with — btc-vault's `SingleKeyConnector` is not exposed through WASM. So the
 * differential oracle here is a second, independent JS implementation: the
 * hand-rolled BIP-341 construction below, which mirrors the Ledger firmware
 * test's `p2trFromSingleLeaf` (test_sign_psbt_validate.py:188) and shares no
 * code with `payments.p2tr`.
 *
 * The differential runs over pinned golden vectors *and* randomised keys — a
 * single hardcoded vector pins one input, not the function.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { Buffer } from "buffer";
import { crypto as bcrypto } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import { TAPSCRIPT_LEAF_VERSION } from "../../utils/bitcoin";
import {
  PEGIN_DEPOSITOR_CLAIM_VOUT,
  deriveDepositorClaimDescriptor,
  deriveDepositorClaimScriptPubKey,
} from "../depositorClaim";

/** NUMS point from btc-vault `crates/vault/src/lib.rs:157-177`. */
const NUMS_XONLY = Buffer.from(
  "50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0",
  "hex",
);

const OP_1 = 0x51;
const PUSH_32 = 0x20;
const OP_CHECKSIG = 0xac;

// --- Independent BIP-341 oracle (no bitcoinjs payments involvement) ---

function oracleLeafScript(depositorPk: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([PUSH_32]),
    depositorPk,
    Buffer.from([OP_CHECKSIG]),
  ]);
}

function oracleTapLeafHash(leaf: Buffer): Buffer {
  // BIP-341 leaf hash: tagged("TapLeaf", version || compactSize(len) || script).
  // Every leaf here is 34 bytes, so the compact size is a single byte.
  return bcrypto.taggedHash(
    "TapLeaf",
    Buffer.concat([
      Buffer.from([TAPSCRIPT_LEAF_VERSION, leaf.length]),
      leaf,
    ]),
  );
}

function oracleTweakNums(merkleRoot: Buffer): { parity: 0 | 1; xOnly: Buffer } {
  const tweak = bcrypto.taggedHash(
    "TapTweak",
    Buffer.concat([NUMS_XONLY, merkleRoot]),
  );
  const tweaked = ecc.xOnlyPointAddTweak(NUMS_XONLY, tweak);
  if (tweaked === null) throw new Error("NUMS taptweak produced no point");
  return {
    parity: tweaked.parity as 0 | 1,
    xOnly: Buffer.from(tweaked.xOnlyPubkey),
  };
}

function oracleDerive(depositorPubkeyHex: string): {
  scriptPubKey: Buffer;
  leafScript: Buffer;
  controlBlock: Buffer;
} {
  const leafScript = oracleLeafScript(Buffer.from(depositorPubkeyHex, "hex"));
  const { parity, xOnly } = oracleTweakNums(oracleTapLeafHash(leafScript));
  return {
    scriptPubKey: Buffer.concat([Buffer.from([OP_1, PUSH_32]), xOnly]),
    leafScript,
    // Single leaf at depth 0 — no sibling hashes follow the internal key.
    controlBlock: Buffer.concat([
      Buffer.from([TAPSCRIPT_LEAF_VERSION | parity]),
      NUMS_XONLY,
    ]),
  };
}

/** Deterministic valid x-only keys, so a failure is reproducible. */
function xOnlyKeyFromSeed(seed: number): string {
  const priv = Buffer.alloc(32);
  priv.writeUInt32BE(seed >>> 0, 28);
  priv[0] = 0x01; // keep it comfortably inside the curve order
  const pub = ecc.pointFromScalar(priv, true);
  if (pub === null) throw new Error(`seed ${seed} produced no point`);
  return Buffer.from(pub).subarray(1).toString("hex");
}

describe("deriveDepositorClaimDescriptor", () => {
  it("builds the leaf script as <depositor> OP_CHECKSIG in 34 bytes", () => {
    const depositor =
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const { leafScript } = deriveDepositorClaimDescriptor(depositor);

    expect(leafScript.length).toBe(34);
    expect(leafScript.toString("hex")).toBe(`20${depositor}ac`);
  });

  it("builds a 33-byte control block of leaf version, parity and the NUMS key", () => {
    const { controlBlock } = deriveDepositorClaimDescriptor(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );

    expect(controlBlock.length).toBe(33);
    // No merkle path: everything after the first byte is the internal key.
    expect(controlBlock.subarray(1).toString("hex")).toBe(
      NUMS_XONLY.toString("hex"),
    );
    expect(controlBlock[0] & 0xfe).toBe(TAPSCRIPT_LEAF_VERSION);
  });

  it("commits to the NUMS internal key, so the key path is unspendable", () => {
    const { internalKey } = deriveDepositorClaimDescriptor(
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    );

    expect(internalKey.toString("hex")).toBe(NUMS_XONLY.toString("hex"));
  });

  it("puts the depositor-claim reserve at PegIn vout 1", () => {
    expect(PEGIN_DEPOSITOR_CLAIM_VOUT).toBe(1);
  });

  it("matches an independent BIP-341 derivation on a pinned golden vector", () => {
    const depositor =
      "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const actual = deriveDepositorClaimDescriptor(depositor);
    const expected = oracleDerive(depositor);

    expect(actual.scriptPubKey.toString("hex")).toBe(
      expected.scriptPubKey.toString("hex"),
    );
    expect(actual.leafScript.toString("hex")).toBe(
      expected.leafScript.toString("hex"),
    );
    expect(actual.controlBlock.toString("hex")).toBe(
      expected.controlBlock.toString("hex"),
    );
  });

  it("matches the independent BIP-341 derivation across 64 randomised keys", () => {
    for (let seed = 1; seed <= 64; seed++) {
      const depositor = xOnlyKeyFromSeed(seed);
      const actual = deriveDepositorClaimDescriptor(depositor);
      const expected = oracleDerive(depositor);

      expect(actual.scriptPubKey.toString("hex")).toBe(
        expected.scriptPubKey.toString("hex"),
      );
      expect(actual.leafScript.toString("hex")).toBe(
        expected.leafScript.toString("hex"),
      );
      // Parity flips with the key, so this also exercises both control-block
      // first bytes rather than only the one the golden vector happens to hit.
      expect(actual.controlBlock.toString("hex")).toBe(
        expected.controlBlock.toString("hex"),
      );
    }
  });

  it("produces a distinct script per depositor key", () => {
    const a = deriveDepositorClaimScriptPubKey(xOnlyKeyFromSeed(1));
    const b = deriveDepositorClaimScriptPubKey(xOnlyKeyFromSeed(2));

    expect(a.toString("hex")).not.toBe(b.toString("hex"));
  });

  it("derives the same script regardless of graph version, having no version input", () => {
    // The reserve's connector is identical across v1/v2/v3 — only the trailing
    // P2A anchor is version-shaped. If a VAULT_WASM_COMMIT bump ever changed
    // that, this function's signature would have to change with it, and this
    // assertion is what makes that a deliberate act rather than a silent one.
    expect(deriveDepositorClaimDescriptor).toHaveLength(1);
  });

  it("rejects a pubkey that is not 32 bytes", () => {
    expect(() => deriveDepositorClaimDescriptor("deadbeef")).toThrow();
  });
});
