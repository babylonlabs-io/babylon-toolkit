/**
 * Tests for the BIP-341 taproot primitives.
 *
 * Two independent oracles:
 * - the official BIP-341 wallet test vectors
 *   (https://github.com/bitcoin/bips/blob/master/bip-0341/wallet-test-vectors.json),
 *   which publish an internal key, a script tree and the control block for
 *   every leaf alongside the resulting scriptPubKey;
 * - bitcoinjs-lib's own `payments.p2tr`, which builds a taptree and emits both
 *   the output script and a leaf's control block.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { payments } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { TAPSCRIPT_LEAF_VERSION } from "../bitcoin";
import { computeTapLeafHash, computeTaprootScriptPubKey } from "../taproot";

/**
 * BIP-341 wallet test vectors, `scriptPubKey` cases 1, 4, 5 and 6 — every case
 * with a script tree, one entry per leaf, pairing each leaf script with the
 * control block the vector publishes for it.
 */
const BIP341_VECTORS: ReadonlyArray<{
  name: string;
  script: string;
  controlBlock: string;
  scriptPubKey: string;
}> = [
  {
    name: "case 1 — single leaf, empty merkle path",
    script:
      "20d85a959b0290bf19bb89ed43c916be835475d013da4b362117393e25a48229b8ac",
    controlBlock:
      "c1187791b6f712a8ea41c8ecdd0ee77fab3e85263b37e1ec18a3651926b3a6cf27",
    scriptPubKey:
      "5120147c9c57132f6e7ecddba9800bb0c4449251c92a1e60371ee77557b6620f3ea3",
  },
  {
    name: "case 4 — two leaves, leaf 0",
    script:
      "2044b178d64c32c4a05cc4f4d1407268f764c940d20ce97abfd44db5c3592b72fdac",
    controlBlock:
      "c1f9f400803e683727b14f463836e1e78e1c64417638aa066919291a225f0e8dd82cb2b90daa543b544161530c925f285b06196940d6085ca9474d41dc3822c5cb",
    scriptPubKey:
      "512077e30a5522dd9f894c3f8b8bd4c4b2cf82ca7da8a3ea6a239655c39c050ab220",
  },
  {
    name: "case 4 — two leaves, leaf 1 (non-pubkey script)",
    script: "07546170726f6f74",
    controlBlock:
      "c1f9f400803e683727b14f463836e1e78e1c64417638aa066919291a225f0e8dd864512fecdb5afa04f98839b50e6f0cb7b1e539bf6f205f67934083cdcc3c8d89",
    scriptPubKey:
      "512077e30a5522dd9f894c3f8b8bd4c4b2cf82ca7da8a3ea6a239655c39c050ab220",
  },
  {
    name: "case 5 — unbalanced tree, depth-1 leaf",
    script:
      "2072ea6adcf1d371dea8fba1035a09f3d24ed5a059799bae114084130ee5898e69ac",
    controlBlock:
      "c0e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6fffe578e9ea769027e4f5a3de40732f75a88a6353a09d767ddeb66accef85e553",
    scriptPubKey:
      "512091b64d5324723a985170e4dc5a0f84c041804f2cd12660fa5dec09fc21783605",
  },
  {
    name: "case 5 — unbalanced tree, depth-2 leaf",
    script:
      "202352d137f2f3ab38d1eaa976758873377fa5ebb817372c71e2c542313d4abda8ac",
    controlBlock:
      "c0e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f9e31407bffa15fefbf5090b149d53959ecdf3f62b1246780238c24501d5ceaf62645a02e0aac1fe69d69755733a9b7621b694bb5b5cde2bbfc94066ed62b9817",
    scriptPubKey:
      "512091b64d5324723a985170e4dc5a0f84c041804f2cd12660fa5dec09fc21783605",
  },
  {
    name: "case 6 — unbalanced tree, depth-2 leaf",
    script:
      "20c440b462ad48c7a77f94cd4532d8f2119dcebbd7c9764557e62726419b08ad4cac",
    controlBlock:
      "c155adf4e8967fbd2e29f20ac896e60c3b0f1d5b0efa9d34941b5958c7b0a0312d737ed1fe30bc42b8022d717b44f0d93516617af64a64753b7a06bf16b26cd711f154e8e8e17c31d3462d7132589ed29353c6fafdb884c5a6e04ea938834f0d9d",
    scriptPubKey:
      "512075169f4001aa68f15bbed28b218df1d0a62cbbcf1188c6665110c293c907b831",
  },
];

/** Deterministic valid x-only pubkey for scalar `n` (n * G). */
function xOnlyKey(n: number): Buffer {
  const scalar = Buffer.alloc(32);
  scalar.writeUInt32BE(n, 28);
  const point = ecc.pointFromScalar(scalar, true);
  if (!point) throw new Error(`invalid scalar ${n}`);
  return Buffer.from(point.subarray(1, 33));
}

/** A single-signature tapscript leaf: `<pubkey> OP_CHECKSIG`. */
function leafScript(n: number): Buffer {
  return Buffer.concat([Buffer.from([0x20]), xOnlyKey(n), Buffer.from([0xac])]);
}

/**
 * Build a right-leaning taptree of `leafCount` leaves via bitcoinjs-lib and
 * return its output script plus the control block published for `redeemIndex`.
 */
function buildTaptree(
  leafCount: number,
  redeemIndex: number,
  internalKeyScalar: number,
): { output: Buffer; script: Buffer; controlBlock: Buffer } {
  const leaves = Array.from({ length: leafCount }, (_, i) => ({
    output: leafScript(i + 1),
    version: TAPSCRIPT_LEAF_VERSION,
  }));
  let scriptTree: Parameters<typeof payments.p2tr>[0]["scriptTree"] =
    leaves[leaves.length - 1];
  for (let i = leaves.length - 2; i >= 0; i--) {
    scriptTree = [leaves[i], scriptTree];
  }

  const redeem = leaves[redeemIndex];
  const payment = payments.p2tr({
    internalPubkey: xOnlyKey(internalKeyScalar),
    scriptTree,
    redeem: { output: redeem.output, redeemVersion: TAPSCRIPT_LEAF_VERSION },
  });
  if (!payment.output || !payment.witness) {
    throw new Error("bitcoinjs-lib produced no p2tr output/witness");
  }
  return {
    output: payment.output,
    script: redeem.output,
    controlBlock: payment.witness[payment.witness.length - 1],
  };
}

describe("computeTapLeafHash", () => {
  it("matches the BIP-341 leaf hash for the case-1 vector", () => {
    const leafHash = computeTapLeafHash(
      TAPSCRIPT_LEAF_VERSION,
      Buffer.from(BIP341_VECTORS[0].script, "hex"),
    );
    expect(leafHash.toString("hex")).toBe(
      "5b75adecf53548f3ec6ad7d78383bf84cc57b55a3127c72b9a2481752dd88b21",
    );
  });
});

describe("computeTaprootScriptPubKey", () => {
  for (const vector of BIP341_VECTORS) {
    it(`recovers the BIP-341 scriptPubKey — ${vector.name}`, () => {
      expect(
        computeTaprootScriptPubKey({
          leafVersion: TAPSCRIPT_LEAF_VERSION,
          script: Buffer.from(vector.script, "hex"),
          controlBlock: Buffer.from(vector.controlBlock, "hex"),
        }).toString("hex"),
      ).toBe(vector.scriptPubKey);
    });
  }

  // 36 bitcoinjs-lib p2tr taptree builds on asm.js secp256k1: ~1.4s here,
  // 6.6s on a 4-vCPU runner, against vitest's 5s default.
  it(
    "agrees with bitcoinjs-lib across tree sizes and leaf positions",
    { timeout: 30_000 },
    () => {
      for (let leafCount = 1; leafCount <= 8; leafCount++) {
        for (let redeemIndex = 0; redeemIndex < leafCount; redeemIndex++) {
          const { output, script, controlBlock } = buildTaptree(
            leafCount,
            redeemIndex,
            leafCount * 100 + redeemIndex + 1,
          );
          expect(
            computeTaprootScriptPubKey({
              leafVersion: TAPSCRIPT_LEAF_VERSION,
              script,
              controlBlock,
            }).toString("hex"),
          ).toBe(output.toString("hex"));
        }
      }
    },
  );

  it("rejects a control block whose length is not 33 + 32*m", () => {
    const { script, controlBlock } = buildTaptree(4, 1, 42);
    expect(() =>
      computeTaprootScriptPubKey({
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script,
        controlBlock: controlBlock.subarray(0, controlBlock.length - 1),
      }),
    ).toThrow(/Malformed Taproot control block/);
  });

  it("rejects a leaf version that disagrees with the control block", () => {
    const { script, controlBlock } = buildTaptree(4, 1, 43);
    expect(() =>
      computeTaprootScriptPubKey({
        leafVersion: 0x50,
        script,
        controlBlock,
      }),
    ).toThrow(/does not match the tapLeafScript leaf version/);
  });

  it("does not recover the output script when a merkle-path node is altered", () => {
    const { output, script, controlBlock } = buildTaptree(4, 1, 44);
    const tampered = Buffer.from(controlBlock);
    tampered[40] ^= 0xff;
    // A different root usually yields a different key, but can also contradict
    // the parity bit — either way the triple must not pass as the same output.
    let recovered: string | null = null;
    try {
      recovered = computeTaprootScriptPubKey({
        leafVersion: TAPSCRIPT_LEAF_VERSION,
        script,
        controlBlock: tampered,
      }).toString("hex");
    } catch {
      recovered = null;
    }
    expect(recovered).not.toBe(output.toString("hex"));
  });
});
