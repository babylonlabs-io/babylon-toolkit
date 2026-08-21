/**
 * Prepare-pipeline gates:
 * - G1: cdata + full APDU byte-identity against the Python oracle for all 22
 *   SIGN_PSBT fixtures, through the production builder and `prepareSignPsbt`.
 * - G4: interpreter completeness — every key, value, and map commitment the
 *   device can ask for is answerable after seeding (the 0x00-prefix leaf trap).
 * - §2.2 rejections: every prepare-time throw is typed and pre-I/O.
 */

import { crypto as bcrypto, Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { isLedgerSignPsbtProtocolError } from "../errors";
import { buildSignPsbtApdu, getPreparedSignPsbtState, prepareSignPsbt } from "../signPsbtPrepare";
import { MerkelizedPsbt } from "../vendor/ledger-bitcoin/merkelizedPsbt";
import { hashLeaf, Merkle } from "../vendor/ledger-bitcoin/merkle";
import { DefaultWalletPolicy } from "../vendor/ledger-bitcoin/policy";
import { PsbtV2 } from "../vendor/ledger-bitcoin/psbtv2";
import { createVarint, parseVarint, sanitizeBigintToNumber } from "../vendor/ledger-bitcoin/varint";
import { buildDefaultTaprootPolicy } from "../walletPolicy";

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

function expectPrepareRejects(psbtHex: string, depositorXOnlyHex: string, messagePattern: RegExp): void {
  try {
    prepareSignPsbt({ psbtHex, depositorXOnlyHex });
    throw new Error("prepareSignPsbt did not throw");
  } catch (error) {
    expect(isLedgerSignPsbtProtocolError(error)).toBe(true);
    expect((error as Error).message).toMatch(messagePattern);
  }
}

describe("SIGN_PSBT cdata + APDU golden (G1, 22 fixtures)", () => {
  it.each(ALL_VECTOR_NAMES.map((name) => [name]))("%s", (name) => {
    const vector = loadVector(name);
    const prepared = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex: depositorKeyFor(name, vector) });

    const state = getPreparedSignPsbtState(prepared);
    expect(Buffer.from(state.cdata).toString("hex")).toBe(vector.sign_psbt_cdata_hex);
    expect(state.originalPsbtHex).toBe(vector.psbt_hex);
    // Display-order txid of the unsigned tx — the replay guard's identity key.
    expect(prepared.unsignedTxid).toBe(
      Transaction.fromBuffer(Psbt.fromHex(vector.psbt_hex).data.globalMap.unsignedTx.toBuffer()).getId(),
    );

    const apdu = buildSignPsbtApdu(state.cdata);
    expect({ cla: apdu.cla, ins: apdu.ins, p1: apdu.p1, p2: apdu.p2 }).toEqual(vector.apdu);
    expect(Buffer.from(apdu.data).toString("hex")).toBe(vector.sign_psbt_cdata_hex);
  });

  it("unsignedTxid is serialization-insensitive — hex casing must not change the identity", () => {
    // The provider's replay guard keys on this; a case-variant of the same
    // bytes reaching a different key would reopen the NoPayout replay hole.
    const vector = loadVector("generated__deposit-flow__pegin__0");
    const lower = prepareSignPsbt({ psbtHex: vector.psbt_hex, depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
    const upper = prepareSignPsbt({
      psbtHex: vector.psbt_hex.toUpperCase(),
      depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX,
    });

    expect(upper.unsignedTxid).toBe(lower.unsignedTxid);
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
    const { interpreter } = getPreparedSignPsbtState(prepared);

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

  it.each([
    ["uppercase hex", TEST_DEPOSITOR_KEY_HEX.toUpperCase()],
    ["63 chars", TEST_DEPOSITOR_KEY_HEX.slice(0, 63)],
    ["non-hex", "zz".repeat(32)],
  ])("rejects a depositor key that is not 64 lowercase hex chars (%s)", (_label, badKey) => {
    expectPrepareRejects(VALID_PSBT_HEX, badKey, /64 lowercase hex/);
  });

  it("rejects a psbtHex that is not even-length hexadecimal", () => {
    expectPrepareRejects(VALID_PSBT_HEX + "z", TEST_DEPOSITOR_KEY_HEX, /not even-length hexadecimal/);
    expectPrepareRejects(VALID_PSBT_HEX.slice(0, -1), TEST_DEPOSITOR_KEY_HEX, /not even-length hexadecimal/);
  });

  it("rejects a tapscript input with no witnessUtxo before any device work", () => {
    // Strip input 0's WITNESS_UTXO (keytype 0x01) by raw-byte surgery — a model
    // round-trip would trip the merge-target parse gate first, since deserialize
    // normalizes and serialize then emits v2 bytes bitcoinjs won't parse. The
    // stripped bytes stay v0, so the tapscript preflight is what fires.
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
    // A bitcoinjs-ACCEPTABLE v0 PSBT with a global VERSION keypair (01fb
    // 0401000000) spliced in after the magic. The merge-target gate runs first,
    // so a bare magic+VERSION stub never reaches PsbtV2 — it dies earlier on
    // "Only one UNSIGNED_TX allowed" and would pass even with the version guard
    // deleted. The matcher's colon-space is what excludes the "(merge target)"
    // wrapper, so only the vendored rejection satisfies it.
    const versionOnePsbtHex =
      "70736274ff01fb040100000001005e02000000010101010101010101010101010101010101010101010101010101010101010101" +
      "0000000000ffffffff01840300000000000022512003030303030303030303030303030303030303030303030303030303030303" +
      "03000000000001012be8030000000000002251200202020202020202020202020202020202020202020202020202020202020202" +
      "0000";
    expectPrepareRejects(
      versionOnePsbtHex,
      TEST_DEPOSITOR_KEY_HEX,
      /PSBT rejected at parse: Only PSBTs of version 0 or 2 are supported/,
    );
  });

  it("rejects a PSBT keypair whose key length is a non-minimal CompactSize", () => {
    // The parser differential, end to end: bip174 advances by the CANONICAL
    // width, so this keypair leaves it 2 bytes early — landing exactly on the
    // final separator, which is why bitcoinjs still accepts the bytes and the
    // merge-target gate passes. Only the strict decode rejects it.
    const nonMinimalKeypair =
      "fd0300" + // key length 3, written as a 3-byte CompactSize instead of 1
      "5003aa" + // key: unknown output keytype 0x50 ‖ key data 0x03 0xaa
      "01" + // value length 1
      "ff"; // value
    const craftedHex = VALID_PSBT_HEX.slice(0, -2) + nonMinimalKeypair + "00";

    expectPrepareRejects(craftedHex, TEST_DEPOSITOR_KEY_HEX, /PSBT rejected at parse: Non-minimal varint/);
  });
});

describe("already-signed inputs are rejected before any device I/O", () => {
  // Without this gate the collision only surfaces in bip174 at merge — after
  // the ceremony ran and the depositor approved. A retry is the live trigger.
  const TAPSCRIPT_VECTOR = "generated__deposit-flow__pegin__0";
  const KEYPATH_VECTOR = "generated__deposit-flow__pre_pegin__0";

  /** The leaf hashes prepare will request for input 0 of the tapscript fixture. */
  function expectedLeafHashHexesOfInput0(psbtHex: string): ReadonlySet<string> {
    const expectation = prepareSignPsbt({ psbtHex, depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX }).table.byInput.get(0);
    if (expectation?.kind !== "tapscript") throw new Error("fixture input 0 is not a tapscript input");
    return expectation.expectedLeafHashHexes;
  }

  it("rejects an input already carrying our tapScriptSig for a leaf this round signs", () => {
    const psbtHex = loadVector(TAPSCRIPT_VECTOR).psbt_hex;
    const [signedLeafHashHex] = [...expectedLeafHashHexesOfInput0(psbtHex)];
    const psbt = Psbt.fromHex(psbtHex);
    psbt.updateInput(0, {
      tapScriptSig: [
        {
          pubkey: Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex"),
          leafHash: Buffer.from(signedLeafHashHex, "hex"),
          signature: Buffer.alloc(64, 0x11),
        },
      ],
    });

    expectPrepareRejects(psbt.toHex(), TEST_DEPOSITOR_KEY_HEX, /input 0 already carries a tapScriptSig/);
  });

  it("rejects an input that is already finalized", () => {
    // Nothing downstream catches this at all: bip174 has no finalized guard,
    // the merge writes the partial sig next to the final witness, and the
    // SDK's finalize fallback then ships the stale witness — after the device
    // signed and the user approved.
    const psbt = Psbt.fromHex(loadVector(TAPSCRIPT_VECTOR).psbt_hex);
    psbt.data.inputs[0].finalScriptWitness = Buffer.from("0101ff", "hex");

    expectPrepareRejects(psbt.toHex(), TEST_DEPOSITOR_KEY_HEX, /input 0 is already finalized/);
  });

  it("rejects an input that is already finalized via finalScriptSig", () => {
    const psbt = Psbt.fromHex(loadVector(TAPSCRIPT_VECTOR).psbt_hex);
    psbt.data.inputs[0].finalScriptSig = Buffer.from("00", "hex");

    expectPrepareRejects(psbt.toHex(), TEST_DEPOSITOR_KEY_HEX, /input 0 is already finalized/);
  });

  it("rejects a tapscript input requesting a non-default sighash type", () => {
    // The device would sign it and append the sighash byte — the 65-byte yield
    // then fails only AFTER the user approved. Gate is pre-I/O.
    const psbt = Psbt.fromHex(loadVector(TAPSCRIPT_VECTOR).psbt_hex);
    psbt.data.inputs[0].sighashType = 1;

    expectPrepareRejects(psbt.toHex(), TEST_DEPOSITOR_KEY_HEX, /input 0 requests sighash type 1/);
  });

  it("rejects a keypath input requesting a non-default sighash type", () => {
    const vector = loadVector(KEYPATH_VECTOR);
    const psbt = Psbt.fromHex(vector.psbt_hex);
    psbt.data.inputs[0].sighashType = 1;

    expectPrepareRejects(psbt.toHex(), depositorKeyFor(KEYPATH_VECTOR, vector), /input 0 requests sighash type 1/);
  });

  it("accepts an input with an explicit SIGHASH_DEFAULT entry", () => {
    // BIP-371 permits an explicit 0x00 entry; it means the same as absence.
    const psbt = Psbt.fromHex(loadVector(TAPSCRIPT_VECTOR).psbt_hex);
    psbt.data.inputs[0].sighashType = 0;

    const prepared = prepareSignPsbt({ psbtHex: psbt.toHex(), depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
    expect(prepared.table.byInput.get(0)?.kind).toBe("tapscript");
  });

  it("accepts a finalized input this round does not sign", () => {
    // Payout input 1 is witnessUtxo-only, so it never enters the table — a
    // co-signed, already-finalized input must not trip the gate.
    const psbt = Psbt.fromHex(loadVector("deposit-flow__claimer_payout__2").psbt_hex);
    psbt.data.inputs[1].finalScriptWitness = Buffer.from("0101ff", "hex");

    const prepared = prepareSignPsbt({ psbtHex: psbt.toHex(), depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
    expect(prepared.table.byInput.has(1)).toBe(false);
  });

  it("accepts an input carrying another signer's tapScriptSig on the same leaf", () => {
    // bip174's dupe key is (pubkey ‖ leafHash), so a co-signer's entry on our
    // leaf never collides — the gate must not over-reject it.
    const psbtHex = loadVector(TAPSCRIPT_VECTOR).psbt_hex;
    const [signedLeafHashHex] = [...expectedLeafHashHexesOfInput0(psbtHex)];
    const psbt = Psbt.fromHex(psbtHex);
    psbt.updateInput(0, {
      tapScriptSig: [
        {
          pubkey: Buffer.from("25d1dff95105f5253c4022f628a996ad3a0d95fbf21d468a1b33f8c160d8f517", "hex"),
          leafHash: Buffer.from(signedLeafHashHex, "hex"),
          signature: Buffer.alloc(64, 0x11),
        },
      ],
    });

    const prepared = prepareSignPsbt({ psbtHex: psbt.toHex(), depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
    expect(prepared.table.expectedYieldCount).toBe(1);
  });

  it("accepts an input carrying our own tapScriptSig on a leaf this round does not sign", () => {
    // The other half of the (key, leaf) conjunction: our signature on a leaf
    // outside this round's set is no bip174 collision, so rejecting it would
    // block the multi-leaf retry the gate exists to let through.
    const psbtHex = loadVector(TAPSCRIPT_VECTOR).psbt_hex;
    const foreignLeafHashHex = "ff".repeat(32);
    expect(expectedLeafHashHexesOfInput0(psbtHex).has(foreignLeafHashHex)).toBe(false);

    const psbt = Psbt.fromHex(psbtHex);
    psbt.updateInput(0, {
      tapScriptSig: [
        {
          pubkey: Buffer.from(TEST_DEPOSITOR_KEY_HEX, "hex"),
          leafHash: Buffer.from(foreignLeafHashHex, "hex"),
          signature: Buffer.alloc(64, 0x11),
        },
      ],
    });

    const prepared = prepareSignPsbt({ psbtHex: psbt.toHex(), depositorXOnlyHex: TEST_DEPOSITOR_KEY_HEX });
    expect(prepared.table.expectedYieldCount).toBe(1);
  });

  it("rejects an input already carrying a tapKeySig when this round signs its keypath", () => {
    const vector = loadVector(KEYPATH_VECTOR);
    const psbt = Psbt.fromHex(vector.psbt_hex);
    psbt.updateInput(0, { tapKeySig: Buffer.alloc(64, 0x22) });

    expectPrepareRejects(psbt.toHex(), depositorKeyFor(KEYPATH_VECTOR, vector), /input 0 already carries a tapKeySig/);
  });
});

const KEYPATH_VECTOR_NAME = "generated__deposit-flow__pre_pegin__0";
const KEYPATH_VECTOR = loadVector(KEYPATH_VECTOR_NAME);
const KEYPATH_FIXTURE_HEX = KEYPATH_VECTOR.psbt_hex;
const KEYPATH_DEPOSITOR_XONLY = depositorKeyFor(KEYPATH_VECTOR_NAME, KEYPATH_VECTOR);

const POLICY = buildDefaultTaprootPolicy({
  masterFingerprintHex: "f5acc2fd",
  coinType: 1,
  accountIndex: 0,
  accountXpub:
    "tpubDDKYE6BREvDsSWMazgHoyQWiJwYaDDYPbCFjYxN3HFXJP5fokeiK4hwK5tTLBNEDBwrDXn8cQ4v9b2xdW62Xr5yxoQdMu1v6c7UDXYVH27U",
  bip32Versions: { public: 0x043587cf, private: 0x04358394 },
});

describe("prepareSignPsbt — wallet-policy mode", () => {
  it("puts the policy id in the wallet_id slot and keeps the hmac all-zero", () => {
    const prepared = prepareSignPsbt({
      psbtHex: KEYPATH_FIXTURE_HEX,
      depositorXOnlyHex: KEYPATH_DEPOSITOR_XONLY,
      walletPolicy: POLICY,
    });
    const cdata = Buffer.from(getPreparedSignPsbtState(prepared).cdata);
    expect(cdata.subarray(cdata.length - 64, cdata.length - 32).toString("hex")).toBe(POLICY.walletIdHex);
    expect(cdata.subarray(cdata.length - 32).toString("hex")).toBe("00".repeat(32));
  });

  it("leaves the no-policy cdata byte-identical (wallet_id and hmac both zero)", () => {
    const prepared = prepareSignPsbt({ psbtHex: KEYPATH_FIXTURE_HEX, depositorXOnlyHex: KEYPATH_DEPOSITOR_XONLY });
    const cdata = Buffer.from(getPreparedSignPsbtState(prepared).cdata);
    expect(cdata.subarray(cdata.length - 64).toString("hex")).toBe("00".repeat(64));
  });

  it("answers GET_PREIMAGE for the policy serialization, its template and its key info", () => {
    const prepared = prepareSignPsbt({
      psbtHex: KEYPATH_FIXTURE_HEX,
      depositorXOnlyHex: KEYPATH_DEPOSITOR_XONLY,
      walletPolicy: POLICY,
    });
    const { interpreter } = getPreparedSignPsbtState(prepared);
    const vendor = new DefaultWalletPolicy(POLICY.descriptorTemplate, POLICY.keyInfo);
    // GET_PREIMAGE request: 0x40 ‖ 0x00 ‖ sha256(preimage) (vendored clientCommands.ts GetPreimageCommand).
    const ask = (preimage: Buffer) =>
      interpreter.execute(Buffer.concat([Buffer.from([0x40, 0x00]), bcrypto.sha256(preimage)]));
    // Response: varint(len) ‖ b ‖ preimage[0:b] — for short preimages b == len, so the tail is the preimage.
    expect(ask(vendor.serialize()).subarray(-vendor.serialize().length).equals(vendor.serialize())).toBe(true);
    const template = Buffer.from(POLICY.descriptorTemplate);
    expect(ask(template).subarray(-template.length).equals(template)).toBe(true);
    // Key-info leaves are hashed as 0x00 ‖ leaf (addKnownList).
    const keyLeaf = Buffer.concat([Buffer.from([0]), Buffer.from(POLICY.keyInfo, "ascii")]);
    expect(ask(keyLeaf).subarray(-keyLeaf.length).equals(keyLeaf)).toBe(true);
  });

  it("rejects a policy whose wallet id is not 64 hex chars before any device I/O", () => {
    expect(() =>
      prepareSignPsbt({
        psbtHex: KEYPATH_FIXTURE_HEX,
        depositorXOnlyHex: KEYPATH_DEPOSITOR_XONLY,
        walletPolicy: { ...POLICY, walletIdHex: "abc" },
      }),
    ).toThrow(/walletIdHex/);
  });

  it("rejects a well-formed wallet id that is not the hash of the policy it ships with", () => {
    // The header carries walletIdHex while the interpreter seeds preimages keyed
    // on template+keyInfo — a mismatch would otherwise die untyped mid-loop.
    expect(() =>
      prepareSignPsbt({
        psbtHex: KEYPATH_FIXTURE_HEX,
        depositorXOnlyHex: KEYPATH_DEPOSITOR_XONLY,
        walletPolicy: { ...POLICY, walletIdHex: "ab".repeat(32) },
      }),
    ).toThrow(/walletIdHex does not match/);
  });
});
