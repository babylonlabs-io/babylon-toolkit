/**
 * Golden-vector tests for the vendored Merkle tree (Ledger's RFC-6962 variant).
 *
 * Vectors are `ledger_bitcoin.merkle.MerkleTree` roots and bottom-up proofs for
 * n = 0..9 leaves, where leaf i's preimage is the single byte `i` and the tree
 * leaf is `hashLeaf(preimage) = SHA256(0x00 ‖ preimage)`. n = 3..9 exercise the
 * `k = largest power of 2 strictly smaller than n` split where a wrong `k` hides.
 */

import { crypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { beforeAll, describe, expect, it } from "vitest";

import { hashLeaf, Merkle } from "../merkle";
import merkleVectors from "./vectors/merkle_mth.json";

beforeAll(() => {
  // The vendored Merkle defaults to bitcoinjs-lib's crypto.sha256. Assert the
  // exact empty-input digest — a mis-wired 32-byte hasher would pass a width
  // check but fail this, catching the problem before the vectors do.
  expect(crypto.sha256(Buffer.alloc(0)).toString("hex")).toBe(
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

describe("Merkle MTH golden vectors", () => {
  it.each(merkleVectors.vectors)("n=$n root and proofs", ({ leaf_preimages, leaf_hashes, root, proofs }) => {
    const leaves = leaf_preimages.map((h) => hashLeaf(Buffer.from(h, "hex")));

    // hashLeaf(preimage) must equal the oracle's element hash.
    leaves.forEach((leaf, i) => expect(leaf.toString("hex")).toBe(leaf_hashes[i]));

    const tree = new Merkle(leaves);
    expect(tree.getRoot().toString("hex")).toBe(root);

    proofs.forEach((proof, i) => {
      expect(tree.getProof(i).map((sibling) => sibling.toString("hex"))).toEqual(proof);
    });
  });

  it("returns the 32-zero root for the empty tree", () => {
    expect(new Merkle([]).getRoot().toString("hex")).toBe("00".repeat(32));
  });

  it("exposes size, leaves, and per-index leaf hashes", () => {
    const leaves = [hashLeaf(Buffer.from([0])), hashLeaf(Buffer.from([1]))];
    const tree = new Merkle(leaves);
    expect(tree.size()).toBe(2);
    expect(tree.getLeaves()).toEqual(leaves);
    expect(tree.getLeafHash(0).toString("hex")).toBe(leaves[0]!.toString("hex"));
  });

  it("throws for an out-of-bounds leaf index", () => {
    const tree = new Merkle([hashLeaf(Buffer.from([0]))]);
    expect(() => tree.getProof(1)).toThrow(/out of bounds/);
    expect(() => tree.getLeafHash(1)).toThrow(/out of bounds/);
  });
});
