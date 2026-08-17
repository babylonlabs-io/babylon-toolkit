/**
 * Golden-vector tests for the vendored MerkleMap commitment.
 *
 * `commitment() = varint(n) ‖ keysRoot ‖ valuesRoot` is the byte layout the
 * device Merkle-verifies inside the SIGN_PSBT header, so a swapped root order or
 * a dropped length prefix must fail here. Vectors are the per-map commitments
 * the Python client (`ledger-bitcoin==0.4.0`) emits over the firmware's PSBT
 * fixtures — real map keys/values, byte-lexicographic key order, built here
 * directly from the vector data (independent of the psbtv2 parser). The outer
 * maps-roots and SIGN_PSBT client-data assertions live in
 * `merkelizedPsbt.golden.test.ts`, derived from the raw PSBTs through the
 * real class over all 22 fixtures.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { MerkleMap } from "../merkleMap";
import payoutVector from "./vectors/signpsbt/deposit-flow__claimer_payout__2.json";
import graphVector from "./vectors/signpsbt/deposit-flow__depositor_graph__0.json";
import peginVector from "./vectors/signpsbt/deposit-flow__pegin__0.json";

type MapEntry = [string, string];
type Commitment = { commitment_hex: string; keys_root: string; values_root: string; sorted_key_order: string[] };
type SignPsbtVector = {
  fixture: string;
  global_map: MapEntry[];
  input_maps: MapEntry[][];
  output_maps: MapEntry[][];
  global_commitment: Commitment;
  input_commitments: Commitment[];
  output_commitments: Commitment[];
};

/** Every merkelized map in a fixture, labelled, in the order the header commits them. */
function mapsOf(v: SignPsbtVector): { label: string; entries: MapEntry[]; commitment: Commitment }[] {
  return [
    { label: `${v.fixture} global`, entries: v.global_map, commitment: v.global_commitment },
    ...v.input_maps.map((entries, i) => ({
      label: `${v.fixture} input[${i}]`,
      entries,
      commitment: v.input_commitments[i]!,
    })),
    ...v.output_maps.map((entries, i) => ({
      label: `${v.fixture} output[${i}]`,
      entries,
      commitment: v.output_commitments[i]!,
    })),
  ];
}

const maps = [peginVector, payoutVector, graphVector].flatMap((v) => mapsOf(v as unknown as SignPsbtVector));

describe("MerkleMap commitment golden vectors", () => {
  it.each(maps)("commits $label to the oracle bytes", ({ entries, commitment }) => {
    const byKey = new Map(entries.map(([k, val]) => [k, val]));
    // Build in the device's byte-lexicographic key order.
    const keys = commitment.sorted_key_order.map((k) => Buffer.from(k, "hex"));
    const values = commitment.sorted_key_order.map((k) => Buffer.from(byKey.get(k)!, "hex"));

    const map = new MerkleMap(keys, values);
    expect(map.keysTree.getRoot().toString("hex")).toBe(commitment.keys_root);
    expect(map.valuesTree.getRoot().toString("hex")).toBe(commitment.values_root);
    expect(map.commitment().toString("hex")).toBe(commitment.commitment_hex);
  });
});

describe("MerkleMap constructor invariants", () => {
  it("rejects keys that are not strictly increasing", () => {
    const a = Buffer.from("01", "hex");
    const b = Buffer.from("02", "hex");
    expect(() => new MerkleMap([b, a], [a, b])).toThrow(/strictly increasing/);
    expect(() => new MerkleMap([a, a], [a, b])).toThrow(/strictly increasing/);
  });

  it("rejects mismatched key/value lengths", () => {
    const a = Buffer.from("01", "hex");
    expect(() => new MerkleMap([a], [])).toThrow(/same length/);
  });
});
