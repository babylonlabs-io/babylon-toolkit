import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  canonicalTxSetFingerprint,
  fingerprintPresignTxSet,
  fingerprintReturnedGraph,
  GraphFingerprintError,
  serializeGraphTx,
} from "../graphFingerprint";

/**
 * A real Claim transaction from a vault-devnet graph, in the serde shape
 * `tx_graph_json` uses. Its txid is referenced by the same graph's Assert
 * input, so re-deriving it end-to-end proves the encoding rather than just
 * pinning whatever this file happens to produce.
 */
const REAL_CLAIM_TX = {
  version: 2,
  lock_time: 0,
  input: [
    {
      previous_output:
        "f68864a74dc1546b15468a36ffbb747d64d359a6a33fa12ffdebdbec637b700a:1",
      script_sig: "",
      sequence: 4294967295,
      witness: [],
    },
  ],
  output: [
    {
      value: 33370,
      script_pubkey:
        "5120110cc0816c4cca46e4bbb5edc1cb31c1de88df17d72a7ac169d5adff1b9795e5",
    },
    {
      value: 546,
      script_pubkey:
        "5120dadb7fb51fee87ef375fa8830a57778058425d13b2de609172a547bf1bacf130",
    },
  ],
};

const REAL_CLAIM_TX_HEX =
  "02000000010a707b63ecdbebfd2fa13fa3a659d3647d74bbff368a46156b54c14da76488f6" +
  "0100000000ffffffff025a82000000000000225120110cc0816c4cca46e4bbb5edc1cb31c1" +
  "de88df17d72a7ac169d5adff1b9795e52202000000000000225120dadb7fb51fee87ef375f" +
  "a8830a57778058425d13b2de609172a547bf1bacf13000000000";

/** The Assert transaction of that same graph spends this outpoint. */
const REAL_CLAIM_TXID =
  "2fca4ce8a9685cd6d8412851efab5a354afb87fd642001926b50bbf0fcee3da2";

/** Exercises the segwit marker, a non-empty script_sig, and a witness stack. */
const SEGWIT_TX = {
  version: 2,
  lock_time: 7,
  input: [
    {
      previous_output: `${"ab".repeat(32)}:3`,
      script_sig: "51",
      sequence: 4294967294,
      witness: ["aabb", "cc"],
    },
  ],
  output: [
    { value: 1000, script_pubkey: `0014${"11".repeat(20)}` },
  ],
};

const SEGWIT_TX_HEX =
  "02000000000101abababababababababababababababababababababababababababababababab030000000151feffffff01e80300000000000016001411111111111111111111111111111111111111110202aabb01cc07000000";

const CHALLENGER_A = "a0".repeat(32);
const CHALLENGER_B = "47".repeat(32);
const LABEL_HASH_1 = "c2".repeat(32);
const LABEL_HASH_2 = "05".repeat(32);

function txid(serialized: Uint8Array): string {
  return bytesToHex(sha256(sha256(serialized)).slice().reverse());
}

/** A graph in the shape `tx_graph_json` parses to. */
function graph(overrides: Record<string, unknown> = {}) {
  return {
    pegin_tx: { tx: SEGWIT_TX },
    claim_tx: { tx: REAL_CLAIM_TX },
    assert_tx: { tx: REAL_CLAIM_TX },
    payout_tx: { tx: REAL_CLAIM_TX },
    challenger_subgraphs: {
      [CHALLENGER_A]: {
        nopayout_tx: { tx: REAL_CLAIM_TX },
        output_label_hashes: [LABEL_HASH_1, LABEL_HASH_2],
      },
      [CHALLENGER_B]: {
        nopayout_tx: { tx: REAL_CLAIM_TX },
        output_label_hashes: [LABEL_HASH_1],
      },
    },
    ...overrides,
  };
}

/** The presign-side view of exactly the same transaction set. */
function presignSet(overrides: Record<string, unknown> = {}) {
  return {
    peginTxHex: SEGWIT_TX_HEX,
    claimTxHex: REAL_CLAIM_TX_HEX,
    assertTxHex: REAL_CLAIM_TX_HEX,
    payoutTxHex: REAL_CLAIM_TX_HEX,
    challengers: [
      {
        challenger_pubkey: CHALLENGER_A,
        nopayout_tx: { tx_hex: REAL_CLAIM_TX_HEX },
        output_label_hashes: [LABEL_HASH_1, LABEL_HASH_2],
      },
      {
        challenger_pubkey: CHALLENGER_B,
        nopayout_tx: { tx_hex: REAL_CLAIM_TX_HEX },
        output_label_hashes: [LABEL_HASH_1],
      },
    ],
    ...overrides,
  };
}

describe("serializeGraphTx", () => {
  it("re-derives a real graph transaction's txid", () => {
    const bytes = serializeGraphTx(REAL_CLAIM_TX, "claim_tx");
    expect(bytesToHex(bytes)).toBe(REAL_CLAIM_TX_HEX);
    // No witness on this transaction, so the serialization is also the txid
    // preimage — the Assert input of the same graph names this value.
    expect(txid(bytes)).toBe(REAL_CLAIM_TXID);
  });

  it("writes the segwit marker, script_sig and witness stack", () => {
    expect(bytesToHex(serializeGraphTx(SEGWIT_TX, "pegin_tx"))).toBe(
      SEGWIT_TX_HEX,
    );
  });

  it("reverses the outpoint txid into wire order", () => {
    const bytes = serializeGraphTx(REAL_CLAIM_TX, "claim_tx");
    const displayTxid =
      REAL_CLAIM_TX.input[0].previous_output.split(":")[0] ?? "";
    expect(bytesToHex(bytes.slice(5, 37))).toBe(
      bytesToHex(hexToBytes(displayTxid).slice().reverse()),
    );
  });

  it.each([
    ["version", { ...REAL_CLAIM_TX, version: undefined }],
    ["lock_time", { ...REAL_CLAIM_TX, lock_time: undefined }],
    ["input", { ...REAL_CLAIM_TX, input: undefined }],
    ["output", { ...REAL_CLAIM_TX, output: undefined }],
  ])("rejects a transaction missing %s", (_name, tx) => {
    expect(() => serializeGraphTx(tx, "claim_tx")).toThrow(
      GraphFingerprintError,
    );
  });

  it.each(["script_sig", "witness"])(
    "rejects an input missing %s instead of hashing it as empty",
    (name) => {
      const input: Record<string, unknown> = { ...REAL_CLAIM_TX.input[0] };
      delete input[name];
      expect(() =>
        serializeGraphTx({ ...REAL_CLAIM_TX, input: [input] }, "claim_tx"),
      ).toThrow(`is missing "${name}"`);
    },
  );

  it.each([
    ["a txid that is not 32 bytes", "dead:0"],
    ["an empty vout", `${"ab".repeat(32)}:`],
    ["an exponent vout", `${"ab".repeat(32)}:1e0`],
    ["a hex vout", `${"ab".repeat(32)}:0x1`],
    ["an extra segment", `${"ab".repeat(32)}:1:2`],
    ["an uppercase txid", `${"AB".repeat(32)}:1`],
  ])("rejects an outpoint with %s", (_name, previousOutput) => {
    const tx = {
      ...REAL_CLAIM_TX,
      input: [{ ...REAL_CLAIM_TX.input[0], previous_output: previousOutput }],
    };
    expect(() => serializeGraphTx(tx, "claim_tx")).toThrow(
      /is not "<txid>:<vout>"/,
    );
  });

  it.each([
    ["a sequence above u32", { sequence: 2 ** 32 }],
    ["a negative sequence", { sequence: -1 }],
  ])("rejects an input with %s", (_name, override) => {
    const tx = {
      ...REAL_CLAIM_TX,
      input: [{ ...REAL_CLAIM_TX.input[0], ...override }],
    };
    expect(() => serializeGraphTx(tx, "claim_tx")).toThrow(/not an integer in/);
  });

  it.each([
    ["a lock_time above u32", { lock_time: 2 ** 32 }],
    ["a version above i32", { version: 2 ** 31 }],
    ["an unsafe output value", {
      output: [{ ...REAL_CLAIM_TX.output[0], value: 2 ** 53 }],
    }],
  ])("rejects a transaction with %s", (_name, override) => {
    expect(() =>
      serializeGraphTx({ ...REAL_CLAIM_TX, ...override }, "claim_tx"),
    ).toThrow(/not an integer in/);
  });

  it("rejects hex that is not lowercase without a prefix", () => {
    const tx = {
      ...REAL_CLAIM_TX,
      output: [
        {
          ...REAL_CLAIM_TX.output[0],
          script_pubkey: `0x${REAL_CLAIM_TX.output[0].script_pubkey}`,
        },
      ],
    };
    expect(() => serializeGraphTx(tx, "claim_tx")).toThrow(
      /not lowercase hex without a prefix/,
    );
  });
});

describe("fingerprintPresignTxSet", () => {
  it("rejects a transaction followed by trailing bytes", () => {
    expect(() =>
      fingerprintPresignTxSet(presignSet({ claimTxHex: `${REAL_CLAIM_TX_HEX}00` })),
    ).toThrow(GraphFingerprintError);
  });

  it("rejects a claim_tx that packs further transactions after the first", () => {
    // Without a strict decode the layout has no framing, so bytes moved from
    // one part into another would hash the same. One part must be one tx.
    expect(() =>
      fingerprintPresignTxSet(
        presignSet({
          claimTxHex: REAL_CLAIM_TX_HEX + REAL_CLAIM_TX_HEX,
          assertTxHex: REAL_CLAIM_TX_HEX,
        }),
      ),
    ).toThrow(GraphFingerprintError);
  });

  it("accepts uppercase hex and a compressed challenger key as the same set", () => {
    const upper = presignSet({
      claimTxHex: REAL_CLAIM_TX_HEX.toUpperCase(),
      challengers: presignSet().challengers.map((c) => ({
        ...c,
        challenger_pubkey: `02${c.challenger_pubkey}`,
      })),
    });
    expect(fingerprintPresignTxSet(upper)).toBe(
      fingerprintPresignTxSet(presignSet()),
    );
  });

  it("rejects a challenger listed twice", () => {
    const [first] = presignSet().challengers;
    expect(() =>
      fingerprintPresignTxSet(
        presignSet({
          challengers: [first, { ...first, challenger_pubkey: `02${first.challenger_pubkey}` }],
        }),
      ),
    ).toThrow(/twice/);
  });
});

describe("fingerprint agreement across presign and activation", () => {
  it("hashes the same transaction set to the same value from either shape", () => {
    expect(fingerprintReturnedGraph(graph())).toBe(
      fingerprintPresignTxSet(presignSet()),
    );
  });

  it("does not depend on challenger ordering", () => {
    const reversed = presignSet({
      challengers: [...presignSet().challengers].reverse(),
    });
    expect(fingerprintPresignTxSet(reversed)).toBe(
      fingerprintPresignTxSet(presignSet()),
    );
  });
});

describe("fingerprint rejects independently corrupted material", () => {
  const baseline = fingerprintReturnedGraph(graph());

  it("changes when a graph transaction changes", () => {
    const tampered = graph({
      payout_tx: {
        tx: {
          ...REAL_CLAIM_TX,
          output: [
            { ...REAL_CLAIM_TX.output[0], value: 33371 },
            REAL_CLAIM_TX.output[1],
          ],
        },
      },
    });
    expect(fingerprintReturnedGraph(tampered)).not.toBe(baseline);
  });

  it("changes when the challenger roster changes", () => {
    const remaining = { ...graph().challenger_subgraphs };
    delete remaining[CHALLENGER_B];
    expect(
      fingerprintReturnedGraph(graph({ challenger_subgraphs: remaining })),
    ).not.toBe(baseline);
  });

  it("changes when a challenger pubkey is substituted", () => {
    const subgraphs = graph().challenger_subgraphs;
    expect(
      fingerprintReturnedGraph(
        graph({
          challenger_subgraphs: {
            [CHALLENGER_A]: subgraphs[CHALLENGER_A],
            ["11".repeat(32)]: subgraphs[CHALLENGER_B],
          },
        }),
      ),
    ).not.toBe(baseline);
  });

  it("changes when GC output label hashes change", () => {
    const subgraphs = graph().challenger_subgraphs;
    expect(
      fingerprintReturnedGraph(
        graph({
          challenger_subgraphs: {
            ...subgraphs,
            [CHALLENGER_A]: {
              ...subgraphs[CHALLENGER_A],
              output_label_hashes: [LABEL_HASH_2, LABEL_HASH_1],
            },
          },
        }),
      ),
    ).not.toBe(baseline);
  });

  it("changes when a challenger's NoPayout transaction changes", () => {
    const subgraphs = graph().challenger_subgraphs;
    expect(
      fingerprintReturnedGraph(
        graph({
          challenger_subgraphs: {
            ...subgraphs,
            [CHALLENGER_B]: {
              ...subgraphs[CHALLENGER_B],
              nopayout_tx: { tx: SEGWIT_TX },
            },
          },
        }),
      ),
    ).not.toBe(baseline);
  });

  it("rejects a label hash that is not 32 bytes", () => {
    const subgraphs = graph().challenger_subgraphs;
    expect(() =>
      fingerprintReturnedGraph(
        graph({
          challenger_subgraphs: {
            ...subgraphs,
            [CHALLENGER_A]: {
              ...subgraphs[CHALLENGER_A],
              output_label_hashes: ["dead"],
            },
          },
        }),
      ),
    ).toThrow(/not 32 bytes/);
  });
});

describe("canonicalTxSetFingerprint", () => {
  it("rejects a challenger pubkey that is not 32 bytes", () => {
    expect(() =>
      canonicalTxSetFingerprint({
        peginTx: new Uint8Array(),
        claimTx: new Uint8Array(),
        assertTx: new Uint8Array(),
        payoutTx: new Uint8Array(),
        challengers: [
          { pubkey: "dead", nopayoutTx: new Uint8Array(), outputLabelHashes: [] },
        ],
      }),
    ).toThrow(/not 32 bytes/);
  });
});
