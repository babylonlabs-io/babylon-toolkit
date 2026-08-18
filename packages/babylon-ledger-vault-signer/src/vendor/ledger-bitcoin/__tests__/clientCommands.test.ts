/**
 * Unit tests for the vendored client-command interpreter — the data server of
 * the SIGN_PSBT 0xE000 loop. Chunking is pinned at the protocol constants
 * (255-byte CONTINUE Lc; 2-byte GET_MORE_ELEMENTS header; 32-byte hashes),
 * proofs against the Python-client Merkle goldens, and the two preimage traps
 * (list elements ARE 0x00-prefixed, wallet-policy material is NOT) against
 * real vector map data.
 */

import { crypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it, vi } from "vitest";

import {
  ClientCommandInterpreter,
  GetMerkleLeafIndexCommand,
  GetMerkleLeafProofCommand,
  GetMoreElementsCommand,
  GetPreimageCommand,
  YieldCommand,
} from "../clientCommands";
import { hashLeaf, Merkle } from "../merkle";
import { MerkleMap } from "../merkleMap";
import { DefaultWalletPolicy } from "../policy";
import { createVarint } from "../varint";
import merkleMth from "./vectors/merkle_mth.json";
import payoutVector from "./vectors/signpsbt/deposit-flow__claimer_payout__2.json";

// Client-command codes (base app client_commands.h; wire spec §4).
const YIELD = 0x10;
const GET_PREIMAGE = 0x40;
const GET_MERKLE_LEAF_PROOF = 0x41;
const GET_MERKLE_LEAF_INDEX = 0x42;
const GET_MORE_ELEMENTS = 0xa0;

const preimageRequest = (hash: Buffer) => Buffer.concat([Buffer.from([GET_PREIMAGE, 0x00]), hash]);
const leafIndexRequest = (root: Buffer, leafHash: Buffer) =>
  Buffer.concat([Buffer.from([GET_MERKLE_LEAF_INDEX]), root, leafHash]);
const leafProofRequest = (root: Buffer, treeSize: number, leafIndex: number) =>
  Buffer.concat([Buffer.from([GET_MERKLE_LEAF_PROOF]), root, createVarint(treeSize), createVarint(leafIndex)]);

/** Deterministic filler so spilled tails are distinguishable from the head. */
const patternBytes = (length: number) => Buffer.from(Array.from({ length }, (_, i) => i % 251));

describe("YieldCommand", () => {
  it("records the raw payload after the code byte and responds empty", () => {
    const results: Buffer[] = [];
    const progressCallback = vi.fn();
    const command = new YieldCommand(results, progressCallback);
    const payload = Buffer.from([0x01, 0xaa, 0xbb]);

    const response = command.execute(Buffer.concat([Buffer.from([YIELD]), payload]));

    expect(response.length).toBe(0);
    expect(results).toEqual([payload]);
    expect(progressCallback).toHaveBeenCalledTimes(1);
  });

  it("passes the payload to the onYield validator", () => {
    const onYield = vi.fn();
    const command = new YieldCommand([], undefined, onYield);

    command.execute(Buffer.from([YIELD, 0x07, 0x08]));

    expect(onYield).toHaveBeenCalledWith(Buffer.from([0x07, 0x08]));
  });

  it("gives the onYield validator its own copy — mutating it cannot corrupt the record", () => {
    const results: Buffer[] = [];
    const command = new YieldCommand(results, undefined, (payload) => {
      payload.fill(0);
    });

    command.execute(Buffer.from([YIELD, 0x07, 0x08]));

    expect(results).toEqual([Buffer.from([0x07, 0x08])]);
  });

  it("aborts on an onYield throw without recording the yield", () => {
    // The vault seam: a failed per-yield assertion must propagate out of
    // execute() and the rejected signature must never look collected.
    const results: Buffer[] = [];
    const progressCallback = vi.fn();
    const command = new YieldCommand(results, progressCallback, () => {
      throw new Error("misrouted signature");
    });

    expect(() => command.execute(Buffer.from([YIELD, 0x07]))).toThrow(/misrouted signature/);
    expect(results).toEqual([]);
    expect(progressCallback).not.toHaveBeenCalled();
  });
});

describe("GetPreimageCommand chunking at the 255-byte response cap", () => {
  function commandFor(preimage: Buffer) {
    const queue: Buffer[] = [];
    const preimages = new Map([[crypto.sha256(preimage).toString("hex"), preimage]]);
    return { command: new GetPreimageCommand(preimages, queue), queue };
  }

  it("serves a 252-byte preimage whole — 1-byte length varint leaves 253 bytes of room", () => {
    const preimage = patternBytes(252);
    const { command, queue } = commandFor(preimage);

    const response = command.execute(preimageRequest(crypto.sha256(preimage)));

    expect(response).toEqual(Buffer.concat([createVarint(252), Buffer.from([252]), preimage]));
    expect(queue).toEqual([]);
  });

  it("spills a 253-byte preimage: the 3-byte length varint caps the first chunk at 251", () => {
    // 253 = 0xFD crosses into the fd-prefixed varint form, so the chunk cap
    // drops to 255 − 3 − 1 = 251 and two bytes spill as 1-byte queue elements.
    const preimage = patternBytes(253);
    const { command, queue } = commandFor(preimage);

    const response = command.execute(preimageRequest(crypto.sha256(preimage)));

    expect(response).toEqual(Buffer.concat([createVarint(253), Buffer.from([251]), preimage.subarray(0, 251)]));
    expect(queue).toEqual([preimage.subarray(251, 252), preimage.subarray(252, 253)]);
  });

  it("queues the tail of a 300-byte preimage and GET_MORE_ELEMENTS drains it in one round", () => {
    const preimage = patternBytes(300);
    const { command, queue } = commandFor(preimage);

    const first = command.execute(preimageRequest(crypto.sha256(preimage)));
    expect(first).toEqual(Buffer.concat([createVarint(300), Buffer.from([251]), preimage.subarray(0, 251)]));
    expect(queue).toHaveLength(49);

    // ⌊253 / 1⌋ = 253 one-byte elements fit one response — all 49 drain at once.
    const more = new GetMoreElementsCommand(queue).execute(Buffer.from([GET_MORE_ELEMENTS]));
    expect(more).toEqual(Buffer.concat([Buffer.from([49, 1]), preimage.subarray(251)]));
    expect(queue).toEqual([]);
  });

  it("throws for an unknown preimage hash", () => {
    const { command } = commandFor(Buffer.from([1, 2, 3]));
    expect(() => command.execute(preimageRequest(Buffer.alloc(32, 0xee)))).toThrow(/unknown preimage/);
  });

  it("rejects a non-zero hash-type byte", () => {
    const preimage = Buffer.from([1, 2, 3]);
    const { command } = commandFor(preimage);
    const request = Buffer.concat([Buffer.from([GET_PREIMAGE, 0x01]), crypto.sha256(preimage)]);
    expect(() => command.execute(request)).toThrow(/first byte should be 0/);
  });
});

type MerkleVector = { n: number; leaf_hashes: string[]; root: string; proofs: string[][] };
const merkleVectors = (merkleMth as unknown as { vectors: MerkleVector[] }).vectors;

describe("GetMerkleLeafProofCommand", () => {
  it("serves every n=9 proof byte-identical to the Python-client golden", () => {
    const vector = merkleVectors.find((v) => v.n === 9);
    if (!vector) throw new Error("merkle_mth.json is missing the n=9 vector");
    const tree = new Merkle(vector.leaf_hashes.map((h) => Buffer.from(h, "hex")));
    expect(tree.getRoot().toString("hex")).toBe(vector.root);
    const root = tree.getRoot();

    for (let index = 0; index < vector.n; index++) {
      const queue: Buffer[] = [];
      const command = new GetMerkleLeafProofCommand(new Map([[vector.root, tree]]), queue);

      const response = command.execute(leafProofRequest(root, vector.n, index));

      const proof = vector.proofs[index]!.map((h) => Buffer.from(h, "hex"));
      // ≤ 6 proof hashes for a 9-leaf tree — everything fits one response.
      expect(response).toEqual(
        Buffer.concat([
          Buffer.from(vector.leaf_hashes[index]!, "hex"),
          Buffer.from([proof.length, proof.length]),
          ...proof,
        ]),
      );
      expect(queue).toEqual([]);
    }
  });

  it("spills proof hashes beyond 6 as 32-byte queue elements — ⌊(255−32−1−1)/32⌋", () => {
    // 300 leaves → 9-hash proofs for left-subtree leaves, and a 3-byte
    // tree_size varint in the request (the firmware header's "4-byte index"
    // comment is stale — requests use varints).
    const leaves = Array.from({ length: 300 }, (_, i) => hashLeaf(Buffer.from([i % 256, Math.floor(i / 256)])));
    const tree = new Merkle(leaves);
    const root = tree.getRoot();
    const queue: Buffer[] = [];
    const command = new GetMerkleLeafProofCommand(new Map([[root.toString("hex"), tree]]), queue);

    const response = command.execute(leafProofRequest(root, 300, 0));

    const proof = tree.getProof(0);
    expect(proof).toHaveLength(9);
    expect(response).toEqual(
      Buffer.concat([tree.getLeafHash(0), Buffer.from([proof.length, 6]), ...proof.slice(0, 6)]),
    );
    expect(queue).toEqual(proof.slice(6));

    // ⌊253 / 32⌋ = 7 ≥ the 3 leftovers — one GET_MORE_ELEMENTS round drains them.
    const more = new GetMoreElementsCommand(queue).execute(Buffer.from([GET_MORE_ELEMENTS]));
    expect(more).toEqual(Buffer.concat([Buffer.from([3, 32]), ...proof.slice(6)]));
  });

  it("refuses to run while the queue still holds spilled elements", () => {
    const vector = merkleVectors.find((v) => v.n === 4);
    if (!vector) throw new Error("merkle_mth.json is missing the n=4 vector");
    const tree = new Merkle(vector.leaf_hashes.map((h) => Buffer.from(h, "hex")));
    const queue = [Buffer.from([0x01])];
    const command = new GetMerkleLeafProofCommand(new Map([[vector.root, tree]]), queue);

    expect(() => command.execute(leafProofRequest(tree.getRoot(), vector.n, 0))).toThrow(/queue is not empty/);
  });

  it("throws for an unknown tree root", () => {
    const command = new GetMerkleLeafProofCommand(new Map(), []);
    expect(() => command.execute(leafProofRequest(Buffer.alloc(32, 0xaa), 4, 0))).toThrow(/unknown tree/);
  });

  it("rejects an index or size that does not match the tree", () => {
    const vector = merkleVectors.find((v) => v.n === 4);
    if (!vector) throw new Error("merkle_mth.json is missing the n=4 vector");
    const tree = new Merkle(vector.leaf_hashes.map((h) => Buffer.from(h, "hex")));
    const command = new GetMerkleLeafProofCommand(new Map([[vector.root, tree]]), []);

    expect(() => command.execute(leafProofRequest(tree.getRoot(), 4, 4))).toThrow(/Invalid index or tree size/);
    expect(() => command.execute(leafProofRequest(tree.getRoot(), 5, 0))).toThrow(/Invalid index or tree size/);
  });
});

type MapEntry = [string, string];
type PayoutVector = {
  input_maps: MapEntry[][];
  input_commitments: { sorted_key_order: string[] }[];
};
const payout = payoutVector as unknown as PayoutVector;

/** The payout fixture's input-0 map as the device would Merkle-verify it. */
function payoutInputMerkleMap(): { merkleMap: MerkleMap; keys: Buffer[]; values: Buffer[] } {
  const byKey = new Map(payout.input_maps[0]);
  const order = payout.input_commitments[0]!.sorted_key_order;
  const keys = order.map((k) => Buffer.from(k, "hex"));
  const values = order.map((k) => {
    const value = byKey.get(k);
    if (value === undefined) throw new Error(`vector map is missing key ${k}`);
    return Buffer.from(value, "hex");
  });
  return { merkleMap: new MerkleMap(keys, values), keys, values };
}

describe("GetMerkleLeafIndexCommand", () => {
  it("finds every key of a real vector map by its leaf hash", () => {
    const { merkleMap, keys } = payoutInputMerkleMap();
    const root = merkleMap.keysTree.getRoot();
    const command = new GetMerkleLeafIndexCommand(new Map([[root.toString("hex"), merkleMap.keysTree]]));

    keys.forEach((key, index) => {
      const response = command.execute(leafIndexRequest(root, hashLeaf(key)));
      expect(response).toEqual(Buffer.concat([Buffer.from([1]), createVarint(index)]));
    });
  });

  it("reports an absent leaf as found=0 instead of throwing — the device probes key presence this way", () => {
    const { merkleMap } = payoutInputMerkleMap();
    const root = merkleMap.keysTree.getRoot();
    const command = new GetMerkleLeafIndexCommand(new Map([[root.toString("hex"), merkleMap.keysTree]]));

    const response = command.execute(leafIndexRequest(root, Buffer.alloc(32, 0xcd)));

    expect(response).toEqual(Buffer.concat([Buffer.from([0]), createVarint(0)]));
  });

  it("throws for an unknown root", () => {
    const command = new GetMerkleLeafIndexCommand(new Map());
    expect(() => command.execute(leafIndexRequest(Buffer.alloc(32, 1), Buffer.alloc(32, 2)))).toThrow(/unknown root/);
  });

  it("encodes a leaf index past the 252 single-byte bound as an fd-prefixed varint", () => {
    // Corpus maps top out at 12 entries — only a synthetic tree reaches the width.
    const elements = Array.from({ length: 301 }, (_, i) => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(i, 0);
      return b;
    });
    const tree = new Merkle(elements.map((el) => hashLeaf(el)));
    const root = tree.getRoot();
    const command = new GetMerkleLeafIndexCommand(new Map([[root.toString("hex"), tree]]));

    const response = command.execute(leafIndexRequest(root, hashLeaf(elements[300]!)));

    // Literal fd 2c 01 = varint(300): pins the wire encoding, not the helper.
    expect(response).toEqual(Buffer.concat([Buffer.from([1]), Buffer.from([0xfd, 0x2c, 0x01])]));
  });

  it("returns the FIRST index for a duplicated leaf (oracle: linear scan)", () => {
    // No real map can hold duplicate keys, but a raw known-list can — pin the
    // first-match rule so a regression to last-match cannot pass the suite.
    const dupe = Buffer.from([0xab]);
    const tree = new Merkle([dupe, Buffer.from([0x01]), dupe].map((b) => hashLeaf(b)));
    const root = tree.getRoot();
    const command = new GetMerkleLeafIndexCommand(new Map([[root.toString("hex"), tree]]));

    const response = command.execute(leafIndexRequest(root, hashLeaf(dupe)));

    expect(response).toEqual(Buffer.concat([Buffer.from([1]), createVarint(0)]));
  });
});

describe("GetMoreElementsCommand", () => {
  it("returns at most ⌊253 / element length⌋ elements per round", () => {
    const queue = Array.from({ length: 300 }, (_, i) => Buffer.from([i % 256]));
    const expectedFirst = Buffer.concat(queue.slice(0, 253));
    const expectedSecond = Buffer.concat(queue.slice(253));
    const command = new GetMoreElementsCommand(queue);

    const first = command.execute(Buffer.from([GET_MORE_ELEMENTS]));
    expect(first).toEqual(Buffer.concat([Buffer.from([253, 1]), expectedFirst]));
    expect(queue).toHaveLength(47);

    const second = command.execute(Buffer.from([GET_MORE_ELEMENTS]));
    expect(second).toEqual(Buffer.concat([Buffer.from([47, 1]), expectedSecond]));
    expect(queue).toEqual([]);
  });

  it("caps 32-byte elements at 7 per round", () => {
    const queue = Array.from({ length: 8 }, (_, i) => Buffer.alloc(32, i + 1));
    const expected = queue.slice(0, 7);
    const command = new GetMoreElementsCommand(queue);

    const response = command.execute(Buffer.from([GET_MORE_ELEMENTS]));

    expect(response).toEqual(Buffer.concat([Buffer.from([7, 32]), ...expected]));
    expect(queue).toHaveLength(1);
  });

  it("rejects a queue holding mixed element lengths", () => {
    const command = new GetMoreElementsCommand([Buffer.from([1]), Buffer.alloc(32, 2)]);
    expect(() => command.execute(Buffer.from([GET_MORE_ELEMENTS]))).toThrow(/different byte length/);
  });

  it("throws when the queue is empty", () => {
    const command = new GetMoreElementsCommand([]);
    expect(() => command.execute(Buffer.from([GET_MORE_ELEMENTS]))).toThrow(/No elements/);
  });

  it("rejects trailing request data", () => {
    const command = new GetMoreElementsCommand([Buffer.from([1])]);
    expect(() => command.execute(Buffer.from([GET_MORE_ELEMENTS, 0x00]))).toThrow(/trailing data/);
  });
});

describe("ClientCommandInterpreter", () => {
  it("serves the device's map-value lookup pattern from a real vector map", () => {
    // Wire-spec §4: leaf index by H(0x00‖key) on the keys root, then the
    // matching value leaf + preimage from the values tree.
    const { merkleMap, keys, values } = payoutInputMerkleMap();
    const interpreter = new ClientCommandInterpreter();
    interpreter.addKnownMapping(merkleMap);

    const keyIndex = 2;
    const key = keys[keyIndex]!;
    const value = values[keyIndex]!;

    const indexResponse = interpreter.execute(leafIndexRequest(merkleMap.keysTree.getRoot(), hashLeaf(key)));
    expect(indexResponse).toEqual(Buffer.concat([Buffer.from([1]), createVarint(keyIndex)]));

    const proofResponse = interpreter.execute(
      leafProofRequest(merkleMap.valuesTree.getRoot(), values.length, keyIndex),
    );
    expect(proofResponse.subarray(0, 32)).toEqual(hashLeaf(value));

    // Trap 1: list-element preimages carry the 0x00 leaf prefix.
    const valuePreimage = Buffer.concat([Buffer.from([0x00]), value]);
    const preimageResponse = interpreter.execute(preimageRequest(crypto.sha256(valuePreimage)));
    expect(preimageResponse).toEqual(
      Buffer.concat([createVarint(valuePreimage.length), Buffer.from([valuePreimage.length]), valuePreimage]),
    );
  });

  it("registers wallet-policy material unprefixed — the second preimage trap", () => {
    const keyInfo =
      "[f5acc2fd/86'/1'/0']tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U";
    const policy = new DefaultWalletPolicy("tr(@0/**)", keyInfo);
    const interpreter = new ClientCommandInterpreter();
    interpreter.addKnownWalletPolicy(policy);

    // The serialized policy is stored RAW (no 0x00 prefix): the response
    // payload opens with the 0x02 wallet version byte.
    const serialized = policy.serialize();
    const policyResponse = interpreter.execute(preimageRequest(crypto.sha256(serialized)));
    expect(policyResponse).toEqual(
      Buffer.concat([createVarint(serialized.length), Buffer.from([serialized.length]), serialized]),
    );
    expect(serialized[0]).toBe(0x02);

    // So is the descriptor template.
    const template = Buffer.from(policy.descriptorTemplate);
    const templateResponse = interpreter.execute(preimageRequest(crypto.sha256(template)));
    expect(templateResponse).toEqual(
      Buffer.concat([createVarint(template.length), Buffer.from([template.length]), template]),
    );

    // The keys, by contrast, are a known list — findable by 0x00-prefixed leaf hash.
    const keysRoot = new Merkle([hashLeaf(Buffer.from(keyInfo, "ascii"))]).getRoot();
    const keyIndexResponse = interpreter.execute(leafIndexRequest(keysRoot, hashLeaf(Buffer.from(keyInfo, "ascii"))));
    expect(keyIndexResponse).toEqual(Buffer.concat([Buffer.from([1]), createVarint(0)]));
  });

  it("collects yields in arrival order and exposes them via getYielded", () => {
    const interpreter = new ClientCommandInterpreter();

    interpreter.execute(Buffer.from([YIELD, 0x01]));
    interpreter.execute(Buffer.from([YIELD, 0x02, 0x03]));

    expect(interpreter.getYielded()).toEqual([Buffer.from([0x01]), Buffer.from([0x02, 0x03])]);
  });

  it("propagates an onYield throw out of execute without recording the yield", () => {
    const interpreter = new ClientCommandInterpreter(undefined, () => {
      throw new Error("assertion failed");
    });

    expect(() => interpreter.execute(Buffer.from([YIELD, 0x01]))).toThrow(/assertion failed/);
    expect(interpreter.getYielded()).toEqual([]);
  });

  it("throws for an unknown command code", () => {
    const interpreter = new ClientCommandInterpreter();
    expect(() => interpreter.execute(Buffer.from([0x99]))).toThrow(/Unexpected command code/);
  });

  it("throws for an empty command", () => {
    const interpreter = new ClientCommandInterpreter();
    expect(() => interpreter.execute(Buffer.from([]))).toThrow(/empty command/);
  });
});
