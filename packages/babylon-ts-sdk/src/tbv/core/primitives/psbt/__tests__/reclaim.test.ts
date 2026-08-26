/**
 * Reclaim PSBT builder tests.
 *
 * The builder signs away a real UTXO, so every assertion it makes gets a
 * rejection test here: one per bind, plus value conservation and the dust
 * floor. The vsize model is measured against a real transaction rather than
 * asserted against the arithmetic that produced it.
 */

import { Buffer } from "buffer";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import {
  PEGIN_DEPOSITOR_CLAIM_VOUT,
  deriveDepositorClaimDescriptor,
} from "../depositorClaim";
import {
  buildReclaimPsbt,
  estimateReclaimFeeSats,
  reclaimVsize,
  type ReclaimReserve,
} from "../reclaim";

const DEPOSITOR =
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const OTHER_DEPOSITOR =
  "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5";

const CLAIM_VALUE = 33_000n;

/**
 * A PegIn transaction shaped like the real one: vault output at vout 0, the
 * depositor-claim reserve at vout 1.
 */
function makePeginTxHex({
  depositorPubkey = DEPOSITOR,
  claimValue = CLAIM_VALUE,
  omitClaimOutput = false,
  // Varies the funding outpoint so each call yields a distinct PegIn txid,
  // the way two real vaults would.
  seed = 7,
}: {
  depositorPubkey?: string;
  claimValue?: bigint;
  omitClaimOutput?: boolean;
  seed?: number;
} = {}): string {
  const tx = new Transaction();
  tx.version = 2;
  tx.addInput(Buffer.alloc(32, seed), 0);
  // vout 0 — the vault output. Contents are irrelevant to the reclaim.
  tx.addOutput(Buffer.concat([Buffer.from([0x51, 0x20]), Buffer.alloc(32, 1)]), 500_000);
  if (!omitClaimOutput) {
    const { scriptPubKey } = deriveDepositorClaimDescriptor(depositorPubkey);
    tx.addOutput(scriptPubKey, Number(claimValue));
  }
  return tx.toHex();
}

function makeInput(
  overrides: Partial<ReclaimReserve> = {},
  seed = 7,
): ReclaimReserve {
  const { scriptPubKey } = deriveDepositorClaimDescriptor(DEPOSITOR);
  return {
    depositorSignedPeginTxHex: makePeginTxHex({ seed }),
    observed: {
      scriptPubKey: scriptPubKey.toString("hex"),
      value: CLAIM_VALUE,
    },
    expectedValue: CLAIM_VALUE,
    ...overrides,
  };
}

/** N distinct reserves, as a real multi-vault batch would look. */
function makeInputs(count: number): ReclaimReserve[] {
  return Array.from({ length: count }, (_, i) => makeInput({}, 7 + i));
}

describe("buildReclaimPsbt", () => {
  it("sweeps the reserve to the depositor's BIP-86 address", () => {
    const { psbtHex, outputValue, totalInputValue } = buildReclaimPsbt({
      depositorPubkey: DEPOSITOR,
      inputs: [makeInput()],
      feeSats: 645n,
    });

    expect(totalInputValue).toBe(CLAIM_VALUE);
    expect(outputValue).toBe(CLAIM_VALUE - 645n);

    const psbt = Psbt.fromHex(psbtHex);
    expect(psbt.txOutputs).toHaveLength(1);
    expect(BigInt(psbt.txOutputs[0].value)).toBe(CLAIM_VALUE - 645n);
  });

  it("spends PegIn vout 1 and pins the claim leaf into the input", () => {
    const { psbtHex } = buildReclaimPsbt({
      depositorPubkey: DEPOSITOR,
      inputs: [makeInput()],
      feeSats: 645n,
    });

    const psbt = Psbt.fromHex(psbtHex);
    const descriptor = deriveDepositorClaimDescriptor(DEPOSITOR);

    expect(psbt.txInputs[0].index).toBe(PEGIN_DEPOSITOR_CLAIM_VOUT);
    const leaf = psbt.data.inputs[0].tapLeafScript?.[0];
    expect(leaf?.script.toString("hex")).toBe(
      descriptor.leafScript.toString("hex"),
    );
    expect(leaf?.controlBlock.toString("hex")).toBe(
      descriptor.controlBlock.toString("hex"),
    );
    expect(psbt.data.inputs[0].tapInternalKey?.toString("hex")).toBe(
      descriptor.internalKey.toString("hex"),
    );
  });

  it("marks the input RBF-enabled with no relative timelock", () => {
    const { psbtHex } = buildReclaimPsbt({
      depositorPubkey: DEPOSITOR,
      inputs: [makeInput()],
      feeSats: 645n,
    });

    // The claim leaf has no OP_CSV, so this is a fee-bump signal only.
    expect(Psbt.fromHex(psbtHex).txInputs[0].sequence).toBe(0xfffffffd);
  });

  it("rejects a reserve that pays a different wallet's claim script", () => {
    // The PegIn belongs to OTHER_DEPOSITOR; the connected wallet is DEPOSITOR.
    const input = makeInput({
      depositorSignedPeginTxHex: makePeginTxHex({
        depositorPubkey: OTHER_DEPOSITOR,
      }),
    });

    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [input],
        feeSats: 645n,
      }),
    ).toThrow(/belongs to a different wallet/);
  });

  it("rejects when the observed UTXO script disagrees with the contract's PegIn", () => {
    const input = makeInput({
      observed: {
        scriptPubKey: deriveDepositorClaimDescriptor(
          OTHER_DEPOSITOR,
        ).scriptPubKey.toString("hex"),
        value: CLAIM_VALUE,
      },
    });

    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [input],
        feeSats: 645n,
      }),
    ).toThrow(/chain state disagrees with the contract's PegIn/);
  });

  it("rejects when the observed value disagrees with the contract's PegIn", () => {
    const input = makeInput({
      observed: {
        scriptPubKey: deriveDepositorClaimDescriptor(
          DEPOSITOR,
        ).scriptPubKey.toString("hex"),
        value: CLAIM_VALUE - 1n,
      },
    });

    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [input],
        feeSats: 645n,
      }),
    ).toThrow(/observed UTXO carries/);
  });

  it("rejects when the reserve value disagrees with the recomputed claim value", () => {
    const input = makeInput({ expectedValue: CLAIM_VALUE + 1n });

    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [input],
        feeSats: 645n,
      }),
    ).toThrow(/depositor-claim value of/);
  });

  it("rejects a PegIn with no output at vout 1", () => {
    const input = makeInput({
      depositorSignedPeginTxHex: makePeginTxHex({ omitClaimOutput: true }),
    });

    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [input],
        feeSats: 645n,
      }),
    ).toThrow(/no depositor-claim reserve to reclaim/);
  });

  it("rejects an output at or below the dust threshold", () => {
    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [makeInput()],
        // Leaves exactly the 546-sat dust threshold.
        feeSats: CLAIM_VALUE - 546n,
      }),
    ).toThrow(/at or below the dust threshold/);
  });

  it("rejects a fee that consumes the whole reserve", () => {
    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [makeInput()],
        feeSats: CLAIM_VALUE,
      }),
    ).toThrow(/not less than the swept total/);
  });

  it("rejects a non-positive fee", () => {
    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [makeInput()],
        feeSats: 0n,
      }),
    ).toThrow(/fee must be positive/);
  });

  it("rejects an empty input set", () => {
    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [],
        feeSats: 645n,
      }),
    ).toThrow(/at least one input/);
  });

  it("conserves value across a two-reserve batch", () => {
    const { psbtHex, outputValue, totalInputValue } = buildReclaimPsbt({
      depositorPubkey: DEPOSITOR,
      inputs: makeInputs(2),
      feeSats: 1_015n,
    });

    expect(totalInputValue).toBe(CLAIM_VALUE * 2n);
    expect(outputValue).toBe(CLAIM_VALUE * 2n - 1_015n);
    // Still a single consolidating output, whatever the input count.
    expect(Psbt.fromHex(psbtHex).txOutputs).toHaveLength(1);
  });

  it("rejects a batch that names the same reserve twice", () => {
    expect(() =>
      buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: [makeInput(), makeInput()],
        feeSats: 1_015n,
      }),
    ).toThrow(/repeats outpoint/);
  });
});

describe("reclaimVsize", () => {
  it("matches the virtual size of a real script-path spend", () => {
    // Measured, not asserted against the arithmetic that produced it: build the
    // transaction the PSBT describes and give each input the witness it will
    // carry — a 64-byte BIP-340 signature under SIGHASH_DEFAULT, the 34-byte
    // leaf, and the 33-byte control block.
    const descriptor = deriveDepositorClaimDescriptor(DEPOSITOR);

    for (const numInputs of [1, 2, 3, 4]) {
      const { psbtHex } = buildReclaimPsbt({
        depositorPubkey: DEPOSITOR,
        inputs: makeInputs(numInputs),
        feeSats: 645n,
      });
      const psbt = Psbt.fromHex(psbtHex);

      const tx = new Transaction();
      tx.version = 2;
      tx.locktime = 0;
      psbt.txInputs.forEach((input) => {
        tx.addInput(input.hash, input.index, input.sequence);
      });
      psbt.txOutputs.forEach((output) => {
        tx.addOutput(output.script, output.value);
      });
      psbt.txInputs.forEach((_input, i) => {
        tx.setWitness(i, [
          Buffer.alloc(64),
          descriptor.leafScript,
          descriptor.controlBlock,
        ]);
      });

      expect(reclaimVsize(numInputs)).toBe(tx.virtualSize());
    }
  });

  it("sizes a single-input sweep at 129 vB", () => {
    expect(reclaimVsize(1)).toBe(129);
  });

  it("adds 75 vB per additional input", () => {
    expect(reclaimVsize(2) - reclaimVsize(1)).toBe(74);
    expect(reclaimVsize(3) - reclaimVsize(2)).toBe(75);
    expect(reclaimVsize(4) - reclaimVsize(3)).toBe(75);
  });

  it("rejects a non-positive input count", () => {
    expect(() => reclaimVsize(0)).toThrow(/positive integer/);
  });
});

describe("estimateReclaimFeeSats", () => {
  it("rounds the rate times vsize up to the next satoshi", () => {
    // 129 vB at 5 sat/vB.
    expect(estimateReclaimFeeSats(5, 1)).toBe(645n);
    // 129 vB at 1.5 sat/vB = 193.5, rounded up.
    expect(estimateReclaimFeeSats(1.5, 1)).toBe(194n);
  });

  it("rejects a non-positive fee rate", () => {
    expect(() => estimateReclaimFeeSats(0, 1)).toThrow(/positive number/);
  });
});
