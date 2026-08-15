/**
 * Prepare-pipeline gates:
 * - G1: cdata + full APDU byte-identity against the Python oracle for all 22
 *   SIGN_PSBT fixtures, through the production builder and `prepareSignPsbt`.
 * - G4: interpreter completeness — every key, value, and map commitment the
 *   device can ask for is answerable after seeding (the 0x00-prefix leaf trap).
 * - §2.2 rejections: every prepare-time throw is typed and pre-I/O.
 */

import { crypto as bcrypto } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { isLedgerSignPsbtProtocolError } from "../errors";
import { buildSignPsbtApdu, buildSignPsbtCdata, prepareSignPsbt } from "../signPsbtPrepare";
import { MerkelizedPsbt } from "../vendor/ledger-bitcoin/merkelizedPsbt";
import { hashLeaf, Merkle } from "../vendor/ledger-bitcoin/merkle";
import { PsbtV2 } from "../vendor/ledger-bitcoin/psbtv2";
import { createVarint, parseVarint, sanitizeBigintToNumber } from "../vendor/ledger-bitcoin/varint";

const VECTORS_DIR = join(__dirname, "..", "vendor", "ledger-bitcoin", "__tests__", "vectors", "signpsbt");

interface SignPsbtVector {
  psbt_hex: string;
  input_maps: [string, string][][];
  sign_psbt_cdata_hex: string;
  apdu: { cla: number; ins: number; p1: number; p2: number };
}

function loadVector(name: string): SignPsbtVector {
  return JSON.parse(readFileSync(join(VECTORS_DIR, `${name}.json`), "utf8")) as SignPsbtVector;
}

const ALL_VECTOR_NAMES = [
  "deposit-flow__claimer_payout__0",
  "deposit-flow__claimer_payout__1",
  "deposit-flow__claimer_payout__2",
  "deposit-flow__claimer_payout__3",
  "deposit-flow__claimer_payout__4",
  "deposit-flow__depositor_graph__0",
  "deposit-flow__depositor_graph__1",
  "deposit-flow__depositor_graph__2",
  "deposit-flow__depositor_graph__3",
  "deposit-flow__depositor_graph__4",
  "deposit-flow__depositor_graph__5",
  "deposit-flow__depositor_graph__6",
  "deposit-flow__depositor_graph__7",
  "deposit-flow__depositor_graph__8",
  "deposit-flow__pegin__0",
  "deposit-flow__pre_pegin__0",
  "generated__deposit-flow__claimer_payout__0",
  "generated__deposit-flow__depositor_graph__0",
  "generated__deposit-flow__depositor_graph__1",
  "generated__deposit-flow__depositor_graph__2",
  "generated__deposit-flow__pegin__0",
  "generated__deposit-flow__pre_pegin__0",
];

// Valid x-only point (the generated fixtures' depositor key) — free parameter
// for tapscript fixtures; pre_pegin fixtures pin their own key instead.
const TEST_DEPOSITOR_KEY_HEX = "e49662aea97a89551401ce54de10474b24b4ab71383b69cf164ea59b3a209e0d";

function depositorKeyFor(name: string, vector: SignPsbtVector): string {
  if (!name.includes("pre_pegin")) return TEST_DEPOSITOR_KEY_HEX;
  const entry = vector.input_maps[0].find(([key]) => key === "17");
  if (!entry) throw new Error("pre_pegin fixture has no TAP_INTERNAL_KEY on input 0");
  return entry[1];
}

describe("SIGN_PSBT cdata + APDU golden (G1, 22 fixtures)", () => {
  it.each(ALL_VECTOR_NAMES.map((name) => [name]))("%s", (name) => {
    const vector = loadVector(name);
    const prepared = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex: depositorKeyFor(name, vector) });

    expect(Buffer.from(prepared.cdata).toString("hex")).toBe(vector.sign_psbt_cdata_hex);
    expect(prepared.originalPsbtHex).toBe(vector.psbt_hex);

    const apdu = buildSignPsbtApdu(prepared.cdata);
    expect({ cla: apdu.cla, ins: apdu.ins, p1: apdu.p1, p2: apdu.p2 }).toEqual(vector.apdu);
    expect(Buffer.from(apdu.data).toString("hex")).toBe(vector.sign_psbt_cdata_hex);
  });
});

describe("header builder wallet fields (#2221/#2222 seam)", () => {
  function merkelize(psbtHex: string): MerkelizedPsbt {
    const psbt = new PsbtV2();
    psbt.deserialize(Buffer.from(psbtHex, "hex"));
    return new MerkelizedPsbt(psbt);
  }

  it("places a caller-provided walletId/walletHmac in the 64-byte tail", () => {
    const vector = loadVector("generated__deposit-flow__pegin__0");
    const merkelized = merkelize(vector.psbt_hex);
    const walletId = Buffer.alloc(32, 0xaa);
    const walletHmac = Buffer.alloc(32, 0xbb);
    const cdata = Buffer.from(buildSignPsbtCdata(merkelized, { walletId, walletHmac }));

    // Same head as the zero-tail golden, custom tail.
    const golden = Buffer.from(vector.sign_psbt_cdata_hex, "hex");
    expect(cdata.subarray(0, cdata.length - 64).toString("hex")).toBe(
      golden.subarray(0, golden.length - 64).toString("hex"),
    );
    expect(cdata.subarray(cdata.length - 64).toString("hex")).toBe("aa".repeat(32) + "bb".repeat(32));
  });

  it("rejects wallet fields that are not exactly 32 bytes", () => {
    const vector = loadVector("generated__deposit-flow__pegin__0");
    const merkelized = merkelize(vector.psbt_hex);
    try {
      buildSignPsbtCdata(merkelized, { walletId: Buffer.alloc(31, 0xaa) });
      throw new Error("buildSignPsbtCdata did not throw");
    } catch (error) {
      expect(isLedgerSignPsbtProtocolError(error)).toBe(true);
      expect((error as Error).message).toMatch(/32 bytes/);
    }
  });
});

describe("interpreter completeness after seeding (G4, 22 fixtures)", () => {
  const GET_PREIMAGE = 0x40;
  const GET_MERKLE_LEAF_PROOF = 0x41;
  const GET_MORE_ELEMENTS = 0xa0;
  const SHA256_LEN = 32;

  /** Fetch a full preimage through GET_PREIMAGE + GET_MORE_ELEMENTS rounds. */
  function fetchPreimage(interpreter: { execute(request: Buffer): Buffer }, element: Buffer): Buffer {
    const leafPreimage = Buffer.concat([Buffer.from([0x00]), element]);
    const request = Buffer.concat([Buffer.from([GET_PREIMAGE, 0x00]), bcrypto.sha256(leafPreimage)]);
    const response = interpreter.execute(request);
    const [totalBig, varintSize] = parseVarint(response, 0);
    const total = sanitizeBigintToNumber(totalBig);
    const firstChunkLen = response[varintSize];
    let collected = Buffer.from(response.subarray(varintSize + 1));
    expect(collected.length).toBe(firstChunkLen);
    while (collected.length < total) {
      const more = interpreter.execute(Buffer.from([GET_MORE_ELEMENTS]));
      expect(more[1]).toBe(1); // preimage spill queues 1-byte elements
      collected = Buffer.concat([collected, more.subarray(2)]);
    }
    return collected;
  }

  /** Fetch a leaf proof, draining any spilled proof hashes. */
  function fetchLeafProof(
    interpreter: { execute(request: Buffer): Buffer },
    root: Buffer,
    treeSize: number,
    leafIndex: number,
  ): Buffer {
    const request = Buffer.concat([
      Buffer.from([GET_MERKLE_LEAF_PROOF]),
      root,
      createVarint(treeSize),
      createVarint(leafIndex),
    ]);
    const response = interpreter.execute(request);
    const proofLen = response[SHA256_LEN];
    let delivered = response[SHA256_LEN + 1];
    while (delivered < proofLen) {
      const more = interpreter.execute(Buffer.from([GET_MORE_ELEMENTS]));
      expect(more[1]).toBe(SHA256_LEN);
      delivered += more[0];
    }
    return Buffer.from(response.subarray(0, SHA256_LEN)); // the leaf hash
  }

  it.each(ALL_VECTOR_NAMES.map((name) => [name]))("%s: every committed element and tree is answerable", (name) => {
    const vector = loadVector(name);
    const prepared = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex: depositorKeyFor(name, vector) });
    const { interpreter } = prepared;

    // Independent reconstruction of what the device may ask for.
    const psbt = new PsbtV2();
    psbt.deserialize(Buffer.from(vector.psbt_hex, "hex"));
    const merkelized = new MerkelizedPsbt(psbt);
    const maps = [merkelized.globalMerkleMap, ...merkelized.inputMerkleMaps, ...merkelized.outputMerkleMaps];

    for (const map of maps) {
      for (const element of [...map.keys, ...map.values]) {
        // Preimage of a Merkle leaf includes its 0x00 prefix — the trap G4 pins.
        expect(fetchPreimage(interpreter, element).toString("hex")).toBe(
          Buffer.concat([Buffer.from([0x00]), element]).toString("hex"),
        );
      }
      for (const tree of [map.keysTree, map.valuesTree]) {
        for (let leafIndex = 0; leafIndex < tree.size(); leafIndex++) {
          expect(fetchLeafProof(interpreter, tree.getRoot(), tree.size(), leafIndex).toString("hex")).toBe(
            tree.getLeafHash(leafIndex).toString("hex"),
          );
        }
      }
    }

    for (const commitments of [merkelized.inputMapCommitments, merkelized.outputMapCommitments]) {
      const tree = new Merkle(commitments.map((commitment) => hashLeaf(commitment)));
      for (const [leafIndex, commitment] of commitments.entries()) {
        expect(fetchPreimage(interpreter, commitment).toString("hex")).toBe(
          Buffer.concat([Buffer.from([0x00]), commitment]).toString("hex"),
        );
        expect(fetchLeafProof(interpreter, tree.getRoot(), tree.size(), leafIndex).toString("hex")).toBe(
          tree.getLeafHash(leafIndex).toString("hex"),
        );
      }
    }
  });
});

describe("prepare-time rejections (§2.2 — all typed, all pre-I/O)", () => {
  const VALID_PSBT_HEX = loadVector("generated__deposit-flow__pegin__0").psbt_hex;

  function expectPrepareRejects(psbtHex: string, depositorXOnlyHex: string, messagePattern: RegExp): void {
    try {
      prepareSignPsbt({ psbtHex, depositorXOnlyHex });
      throw new Error("prepareSignPsbt did not throw");
    } catch (error) {
      expect(isLedgerSignPsbtProtocolError(error)).toBe(true);
      expect((error as Error).message).toMatch(messagePattern);
    }
  }

  it.each([
    ["uppercase hex", TEST_DEPOSITOR_KEY_HEX.toUpperCase()],
    ["63 chars", TEST_DEPOSITOR_KEY_HEX.slice(0, 63)],
    ["non-hex", "zz".repeat(32)],
  ])("rejects a depositor key that is not 64 lowercase hex chars (%s)", (_label, badKey) => {
    expectPrepareRejects(VALID_PSBT_HEX, badKey, /64 lowercase hex/);
  });

  it("rejects a psbtHex that is not even-length hex", () => {
    expectPrepareRejects(VALID_PSBT_HEX + "z", TEST_DEPOSITOR_KEY_HEX, /not even-length hex/);
    expectPrepareRejects(VALID_PSBT_HEX.slice(0, -1), TEST_DEPOSITOR_KEY_HEX, /not even-length hex/);
  });

  it("rejects a tapscript input with no witnessUtxo before any device work", () => {
    // Strip input 0's WITNESS_UTXO (keytype 0x01) by raw-byte surgery — a model
    // round-trip through PsbtV2.serialize would trip the merge-target parse
    // gate first (its v0 re-emission is not bitcoinjs-canonical). The stripped
    // bytes stay bitcoinjs-parseable, so the tapscript preflight is what fires.
    const raw = Buffer.from(VALID_PSBT_HEX, "hex");
    // key = len(01) ‖ keytype(01), value = varint(len) ‖ witnessUtxo bytes.
    const keyIndex = raw.indexOf(Buffer.from([0x01, 0x01]), 5);
    expect(keyIndex).toBeGreaterThan(0);
    const valueLen = raw[keyIndex + 2];
    const stripped = Buffer.concat([raw.subarray(0, keyIndex), raw.subarray(keyIndex + 2 + 1 + valueLen)]);
    expectPrepareRejects(
      stripped.toString("hex"),
      depositorKeyFor("generated__deposit-flow__pegin__0", loadVector("generated__deposit-flow__pegin__0")),
      /tapscript but has no witnessUtxo/,
    );
  });

  it("wraps an off-curve depositor key as a typed preflight rejection", () => {
    // 64 valid hex chars, but not a point on secp256k1 — bitcoinjs p2tr throws
    // a raw TypeError; the prepare contract must retype it.
    expectPrepareRejects(VALID_PSBT_HEX, "ff".repeat(32), /PSBT rejected at preflight/);
  });

  it("wraps the vendored parse throw for an unsupported PSBT version", () => {
    // magic ‖ global map { VERSION(0xfb) → 1 } ‖ end-of-map — version 1 is
    // rejected inside PsbtV2.deserialize and surfaces as a typed error.
    const versionOnePsbtHex = "70736274ff" + "01fb" + "0401000000" + "00";
    expectPrepareRejects(versionOnePsbtHex, TEST_DEPOSITOR_KEY_HEX, /PSBT rejected at parse/);
  });
});
