/**
 * Golden-vector tests for the vendored MerkelizedPsbt wrapper.
 *
 * `psbt_hex → PsbtV2.deserialize → new MerkelizedPsbt(psbt)` is the exact
 * pipeline the SIGN_PSBT host runs to produce the header inputs, so every
 * per-map commitment, the outer inputs/outputs maps-roots, and the reassembled
 * client data must match what the Python client (`ledger-bitcoin==0.4.0`)
 * emits over the firmware's PSBT fixtures — all 22 of them. This supersedes
 * the hand-concatenated maps-root/cdata assertions that previously lived in
 * `merkleMap.golden.test.ts` (3 fixtures, vector-supplied commitments): here
 * the same bytes are derived from the raw PSBT through the real class.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { MerkelizedPsbt } from "../merkelizedPsbt";
import { hashLeaf, Merkle } from "../merkle";
import { PsbtV2 } from "../psbtv2";
import { createVarint } from "../varint";
import claimerPayout0 from "./vectors/signpsbt/deposit-flow__claimer_payout__0.json";
import claimerPayout1 from "./vectors/signpsbt/deposit-flow__claimer_payout__1.json";
import claimerPayout2 from "./vectors/signpsbt/deposit-flow__claimer_payout__2.json";
import claimerPayout3 from "./vectors/signpsbt/deposit-flow__claimer_payout__3.json";
import claimerPayout4 from "./vectors/signpsbt/deposit-flow__claimer_payout__4.json";
import depositorGraph0 from "./vectors/signpsbt/deposit-flow__depositor_graph__0.json";
import depositorGraph1 from "./vectors/signpsbt/deposit-flow__depositor_graph__1.json";
import depositorGraph2 from "./vectors/signpsbt/deposit-flow__depositor_graph__2.json";
import depositorGraph3 from "./vectors/signpsbt/deposit-flow__depositor_graph__3.json";
import depositorGraph4 from "./vectors/signpsbt/deposit-flow__depositor_graph__4.json";
import depositorGraph5 from "./vectors/signpsbt/deposit-flow__depositor_graph__5.json";
import depositorGraph6 from "./vectors/signpsbt/deposit-flow__depositor_graph__6.json";
import depositorGraph7 from "./vectors/signpsbt/deposit-flow__depositor_graph__7.json";
import depositorGraph8 from "./vectors/signpsbt/deposit-flow__depositor_graph__8.json";
import pegin0 from "./vectors/signpsbt/deposit-flow__pegin__0.json";
import prePegin0 from "./vectors/signpsbt/deposit-flow__pre_pegin__0.json";
import generatedClaimerPayout0 from "./vectors/signpsbt/generated__deposit-flow__claimer_payout__0.json";
import generatedDepositorGraph0 from "./vectors/signpsbt/generated__deposit-flow__depositor_graph__0.json";
import generatedDepositorGraph1 from "./vectors/signpsbt/generated__deposit-flow__depositor_graph__1.json";
import generatedDepositorGraph2 from "./vectors/signpsbt/generated__deposit-flow__depositor_graph__2.json";
import generatedPegin0 from "./vectors/signpsbt/generated__deposit-flow__pegin__0.json";
import generatedPrePegin0 from "./vectors/signpsbt/generated__deposit-flow__pre_pegin__0.json";

type Commitment = { n_entries: number; keys_root: string; values_root: string; commitment_hex: string };
type SignPsbtVector = {
  fixture: string;
  batch_index: number;
  psbt_hex: string;
  n_inputs: number;
  n_outputs: number;
  global_commitment: Commitment;
  input_commitments: Commitment[];
  output_commitments: Commitment[];
  inputs_maps_root: string;
  outputs_maps_root: string;
  sign_psbt_cdata_hex: string;
};

// deposit-flow__pegin__0 is a stale pre-v22 signet capture (1-in/2-out; the
// current validator requires 1-in/3-out) — fine for these byte-level goldens.
const vectors = [
  claimerPayout0,
  claimerPayout1,
  claimerPayout2,
  claimerPayout3,
  claimerPayout4,
  depositorGraph0,
  depositorGraph1,
  depositorGraph2,
  depositorGraph3,
  depositorGraph4,
  depositorGraph5,
  depositorGraph6,
  depositorGraph7,
  depositorGraph8,
  pegin0,
  prePegin0,
  generatedClaimerPayout0,
  generatedDepositorGraph0,
  generatedDepositorGraph1,
  generatedDepositorGraph2,
  generatedPegin0,
  generatedPrePegin0,
] as unknown as SignPsbtVector[];

const cases = vectors.map((v) => ({ id: `${v.fixture}#${v.batch_index}`, v }));

function merkelize(v: SignPsbtVector): MerkelizedPsbt {
  const psbt = new PsbtV2();
  psbt.deserialize(Buffer.from(v.psbt_hex, "hex"));
  return new MerkelizedPsbt(psbt);
}

const hex = (b: Buffer) => b.toString("hex");

describe("MerkelizedPsbt commitment golden vectors (22 SIGN_PSBT fixtures)", () => {
  it.each(cases)("commits every $id map to the oracle bytes", ({ v }) => {
    const merkelized = merkelize(v);

    expect(merkelized.getGlobalSize()).toBe(v.global_commitment.n_entries);
    expect(hex(merkelized.globalMerkleMap.keysTree.getRoot())).toBe(v.global_commitment.keys_root);
    expect(hex(merkelized.globalMerkleMap.valuesTree.getRoot())).toBe(v.global_commitment.values_root);
    expect(hex(merkelized.getGlobalKeysValuesRoot())).toBe(v.global_commitment.commitment_hex);

    expect(merkelized.inputMapCommitments.map(hex)).toEqual(v.input_commitments.map((c) => c.commitment_hex));
    expect(merkelized.outputMapCommitments.map(hex)).toEqual(v.output_commitments.map((c) => c.commitment_hex));
  });

  it.each(cases)("roots the $id map commitments and reassembles the SIGN_PSBT client data", ({ v }) => {
    const merkelized = merkelize(v);
    expect(merkelized.getGlobalInputCount()).toBe(v.n_inputs);
    expect(merkelized.getGlobalOutputCount()).toBe(v.n_outputs);

    // The outer tree hashes each per-map COMMITMENT as a 0x00-prefixed leaf —
    // a distinct byte treatment from the inner keys/values trees.
    const inputsRoot = new Merkle(merkelized.inputMapCommitments.map((c) => hashLeaf(c))).getRoot();
    const outputsRoot = new Merkle(merkelized.outputMapCommitments.map((c) => hashLeaf(c))).getRoot();
    expect(hex(inputsRoot)).toBe(v.inputs_maps_root);
    expect(hex(outputsRoot)).toBe(v.outputs_maps_root);

    // Wire-spec §2 layout: globalCommitment ‖ varint(nIn) ‖ inputsRoot ‖
    // varint(nOut) ‖ outputsRoot ‖ wallet_id(32×00) ‖ wallet_hmac(32×00) —
    // the zero tail is the vault's no-policy routing switch.
    const cdata = Buffer.concat([
      merkelized.getGlobalKeysValuesRoot(),
      createVarint(merkelized.getGlobalInputCount()),
      inputsRoot,
      createVarint(merkelized.getGlobalOutputCount()),
      outputsRoot,
      Buffer.alloc(64, 0),
    ]);
    expect(hex(cdata)).toBe(v.sign_psbt_cdata_hex);
  });
});
