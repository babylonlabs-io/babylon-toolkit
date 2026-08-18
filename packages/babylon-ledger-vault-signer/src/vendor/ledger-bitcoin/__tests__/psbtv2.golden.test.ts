/**
 * Golden-vector tests for the vendored PSBTv2 map model.
 *
 * `deserialize` (v0 or v2 bytes) → `normalizeToV2` → `serialize` is the exact
 * pipeline the SIGN_PSBT host runs before merkleization, so every key and value
 * byte must match what the Python client (`ledger-bitcoin==0.4.0`, the oracle
 * the vault firmware's own tests drive SIGN_PSBT through) produces over the
 * firmware's PSBT fixtures — see the vendor `README.md` for provenance. The
 * oracle serializes maps in insertion order while the vendored serializer emits
 * the byte-lexicographic key order the device enforces, so raw-hex identity
 * with `psbt_v2_hex` is asserted by reassembling the normalized model in the
 * oracle's recorded order; the sorted order itself is pinned per map against
 * `sorted_key_order`.
 *
 * Raw `serialize()` bytes are compared to the oracle only via the `splitMaps`
 * round-trip; canonical varint emission is separately closed by the shared
 * `createVarint` encoder + `varint.json` goldens + the two ported upstream
 * round-trips that DO pin raw bytes.
 */

import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { BufferReader, BufferWriter } from "../buffertools";
import { PsbtV2 } from "../psbtv2";
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

type MapEntry = [keyHex: string, valueHex: string];
type Commitment = { sorted_key_order: string[] };
type SignPsbtVector = {
  fixture: string;
  batch_index: number;
  psbt_hex: string;
  psbt_v2_hex: string;
  n_inputs: number;
  n_outputs: number;
  global_map: MapEntry[];
  input_maps: MapEntry[][];
  output_maps: MapEntry[][];
  global_commitment: Commitment;
  input_commitments: Commitment[];
  output_commitments: Commitment[];
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

const PSBT_MAGIC = Buffer.from([0x70, 0x73, 0x62, 0x74, 0xff]);

/** Splits serialized PSBT bytes into per-map [keyHex, valueHex] lists (global, inputs…, outputs…), in wire order. */
function splitMaps(psbt: Buffer, mapCount: number): MapEntry[][] {
  const reader = new BufferReader(psbt);
  if (!reader.readSlice(5).equals(PSBT_MAGIC)) {
    throw new Error("Invalid magic bytes");
  }
  const maps: MapEntry[][] = [];
  for (let m = 0; m < mapCount; m++) {
    const entries: MapEntry[] = [];
    for (;;) {
      const keyLen = Number(reader.readVarInt());
      if (keyLen === 0) break;
      const key = reader.readSlice(keyLen);
      const value = reader.readVarSlice();
      entries.push([key.toString("hex"), value.toString("hex")]);
    }
    maps.push(entries);
  }
  if (reader.available() !== 0) {
    throw new Error("Trailing bytes after the last map");
  }
  return maps;
}

/** Inverse of splitMaps: re-emits per-map entries (in the given order) as PSBT bytes. */
function joinMaps(maps: MapEntry[][]): Buffer {
  const writer = new BufferWriter();
  writer.writeSlice(PSBT_MAGIC);
  for (const entries of maps) {
    for (const [keyHex, valueHex] of entries) {
      const key = Buffer.from(keyHex, "hex");
      writer.writeVarInt(key.length);
      writer.writeSlice(key);
      writer.writeVarSlice(Buffer.from(valueHex, "hex"));
    }
    writer.writeUInt8(0);
  }
  return writer.buffer();
}

describe("PsbtV2 normalization golden vectors (22 SIGN_PSBT fixtures)", () => {
  it.each(cases)("normalizes $id to the oracle's v2 map content in device key order", ({ v }) => {
    const psbt = new PsbtV2();
    psbt.deserialize(Buffer.from(v.psbt_hex, "hex"));
    expect(psbt.getGlobalPsbtVersion()).toBe(2);
    expect(psbt.getGlobalInputCount()).toBe(v.n_inputs);
    expect(psbt.getGlobalOutputCount()).toBe(v.n_outputs);

    const serializedMaps = splitMaps(psbt.serialize(), 1 + v.n_inputs + v.n_outputs);
    const oracle = [
      { entries: v.global_map, order: v.global_commitment.sorted_key_order },
      ...v.input_maps.map((entries, i) => ({ entries, order: v.input_commitments[i]!.sorted_key_order })),
      ...v.output_maps.map((entries, i) => ({ entries, order: v.output_commitments[i]!.sorted_key_order })),
    ];
    expect(serializedMaps).toHaveLength(oracle.length);
    serializedMaps.forEach((entries, i) => {
      const { entries: oracleEntries, order } = oracle[i]!;
      // The unified comparator gate: serialized key order == byte-lex sorted_key_order.
      expect(entries.map(([k]) => k)).toEqual(order);
      // Every key and value byte-identical to the oracle's map content.
      const oracleByKey = new Map(oracleEntries);
      expect(entries).toEqual(order.map((k) => [k, oracleByKey.get(k)]));
    });
  });

  it.each(cases)("reassembles $id into psbt_v2_hex byte-for-byte", ({ v }) => {
    const psbt = new PsbtV2();
    psbt.deserialize(Buffer.from(v.psbt_hex, "hex"));
    const modelMaps = splitMaps(psbt.serialize(), 1 + v.n_inputs + v.n_outputs);
    const oracleMaps = [v.global_map, ...v.input_maps, ...v.output_maps];

    // Re-emit the normalized model's bytes in the oracle's recorded entry order:
    // full byte-identity with psbt_v2_hex, independent of serializer sort order.
    const writer = new BufferWriter();
    writer.writeSlice(PSBT_MAGIC);
    oracleMaps.forEach((oracleEntries, i) => {
      const model = new Map(modelMaps[i]);
      for (const [keyHex] of oracleEntries) {
        const valueHex = model.get(keyHex);
        if (valueHex === undefined) {
          throw new Error(`Normalized model is missing key ${keyHex} in map ${i}`);
        }
        const key = Buffer.from(keyHex, "hex");
        writer.writeVarInt(key.length);
        writer.writeSlice(key);
        writer.writeVarSlice(Buffer.from(valueHex, "hex"));
      }
      writer.writeUInt8(0);
    });
    expect(writer.buffer().toString("hex")).toBe(v.psbt_v2_hex);
  });

  it.each(cases)("normalizes the v0 file and the oracle's v2 bytes of $id to identical canonical bytes", ({ v }) => {
    const fromV0 = new PsbtV2();
    fromV0.deserialize(Buffer.from(v.psbt_hex, "hex"));
    const fromV2 = new PsbtV2();
    fromV2.deserialize(Buffer.from(v.psbt_v2_hex, "hex"));
    expect(fromV0.serialize().toString("hex")).toBe(fromV2.serialize().toString("hex"));
  });

  // The v0 pegin fixtures reach deserialize with ZERO-entry per-output maps —
  // this pins the pre-normalization shape; the AMOUNT/SCRIPT synthesis itself
  // is asserted by the first golden test above.
  it("parses the v0 pegin fixtures through their zero-entry pre-normalization output maps", () => {
    for (const v of [pegin0, generatedPegin0] as unknown as SignPsbtVector[]) {
      const rawMaps = splitMaps(Buffer.from(v.psbt_hex, "hex"), 1 + v.n_inputs + v.n_outputs);
      const rawOutputMaps = rawMaps.slice(1 + v.n_inputs);
      expect(rawOutputMaps).toHaveLength(v.n_outputs);
      for (const outputMap of rawOutputMaps) {
        expect(outputMap).toEqual([]);
      }
    }
  });
});

// Malformed-input gates added on top of upstream, which parse-accepted both shapes.
describe("PsbtV2 deserialize malformed-input rejections", () => {
  it("rejects a repeated keypair within a single map", () => {
    const v = prePegin0 as unknown as SignPsbtVector;
    const maps = splitMaps(Buffer.from(v.psbt_v2_hex, "hex"), 1 + v.n_inputs + v.n_outputs);
    // BIP-174 forbids duplicate keys in a map — re-emit the global map with its first pair twice.
    maps[0]!.push(maps[0]![0]!);
    const psbt = new PsbtV2();
    expect(() => psbt.deserialize(joinMaps(maps))).toThrow(/[Rr]epeated|[Dd]uplicate/);
  });

  it("rejects trailing bytes after the last output map", () => {
    const v = prePegin0 as unknown as SignPsbtVector;
    const withGarbage = Buffer.concat([Buffer.from(v.psbt_v2_hex, "hex"), Buffer.from([0xde, 0xad, 0xbe, 0xef])]);
    const psbt = new PsbtV2();
    expect(() => psbt.deserialize(withGarbage)).toThrow(/[Tt]railing/);
  });
});

// Ported from upstream bitcoin_client_js/src/__tests__/psbtv2.test.ts (jest →
// vitest). The v0 fixture of the second case carries taproot keyTypes
// 0x15/0x16/0x17/0x18, proving byte-identical pass-through of fields beyond the
// typed accessor surface.
describe("PsbtV2 round-trips (ported upstream tests)", () => {
  it("deserializes a psbtV2 and reserializes it unchanged", () => {
    const psbtBuf = Buffer.from(
      "cHNidP8BAAoBAAAAAAAAAAAAAQIEAgAAAAEDBAAAAAABBAECAQUBAgH7BAIAAAAAAQBxAgAAAAGTarLgEHL3k8/kyXdU3hth/gPn22U2yLLyHdC1dCxIRQEAAAAA/v///wLe4ccAAAAAABYAFOt418QL8QY7Dj/OKcNWW2ichVmrECcAAAAAAAAWABQjGNZvhP71xIdfkzsDjcY4MfjaE/mXHgABAR8QJwAAAAAAABYAFCMY1m+E/vXEh1+TOwONxjgx+NoTIgYDRV7nztyXsLpDW4AGb8ksljo0xgAxeYHRNTMMTuQ6x6MY9azC/VQAAIABAACAAAAAgAAAAAABAAAAAQ4gniz+J/Cth7eKI31ddAXUowZmyjYdWFpGew3+QiYrTbQBDwQBAAAAARAE/f///wESBAAAAAAAAQBxAQAAAAEORx706Sway1HvyGYPjT9pk26pybK/9y/5vIHFHvz0ZAEAAAAAAAAAAAJgrgoAAAAAABYAFDXG4N1tPISxa6iF3Kc6yGPQtZPsrwYyAAAAAAAWABTcKG4M0ua9N86+nsNJ+18IkFZy/AAAAAABAR9grgoAAAAAABYAFDXG4N1tPISxa6iF3Kc6yGPQtZPsIgYCcbW3ea2HCDhYd5e89vDHrsWr52pwnXJPSNLibPh08KAY9azC/VQAAIABAACAAAAAgAEAAAAAAAAAAQ4gr7+uBlkPdB/xr1m2rEYRJjNqTEqC21U99v76tzesM/MBDwQAAAAAARAE/f///wESBAAAAAAAIgICKexHcnEx7SWIogxG7amrt9qm9J/VC6/nC5xappYcTswY9azC/VQAAIABAACAAAAAgAEAAAAKAAAAAQMIqDoGAAAAAAABBBYAFOs4+puBKPgfJule2wxf+uqDaQ/kAAEDCOCTBAAAAAAAAQQiACA/qWbJ3c3C/ZbkpeG8dlufr2zos+tPEQSq1r33cyTlvgA=",
      "base64",
    );

    const psbt = new PsbtV2();
    psbt.deserialize(psbtBuf);

    expect(psbt.serialize()).toEqual(psbtBuf);
  });

  it("deserializes a psbtV0 and reserializes it as a valid psbtV2", () => {
    const psbtV0 = Buffer.from(
      "cHNidP8BAFICAAAAAR/BzFdxy4OGDMVtlLz+2ThgjBf2NmJDW0HpxE/8/TFCAQAAAAD9////ATkFAAAAAAAAFgAUqo7zdMr638p2kC3bXPYcYLv9nYUAAAAAAAEBK0wGAAAAAAAAIlEg/AoQ0wjH5BtLvDZC+P2KwomFOxznVaDG0NSV8D2fLaQBAwQBAAAAIhXBUBcQi+zqje3FMAuyI4azqzA2esJi+c5eWDJuuD46IvUjIGsW6MH5efpMwPBbajAK//+UFFm28g3nfeVbAWDvjkysrMAhFlAXEIvs6o3txTALsiOGs6swNnrCYvnOXlgybrg+OiL1HQB2IjpuMAAAgAEAAIAAAACAAgAAgAAAAAAAAAAAIRZrFujB+Xn6TMDwW2owCv//lBRZtvIN533lWwFg745MrD0BCS7aAzYX4hDuf30ON4pASuocSLVqoQMCK+z3dG5HAKT1rML9MAAAgAEAAIAAAACAAgAAgAAAAAAAAAAAARcgUBcQi+zqje3FMAuyI4azqzA2esJi+c5eWDJuuD46IvUBGCAJLtoDNhfiEO5/fQ43ikBK6hxItWqhAwIr7Pd0bkcApAAA",
      "base64",
    );

    // the same psbt converted to V2, with keys sorted in lexicographical order
    const psbtV2 = Buffer.from(
      "cHNidP8BAgQCAAAAAQMEAAAAAAEEAQEBBQEBAfsEAgAAAAABAStMBgAAAAAAACJRIPwKENMIx+QbS7w2Qvj9isKJhTsc51WgxtDUlfA9ny2kAQMEAQAAAAEOIB/BzFdxy4OGDMVtlLz+2ThgjBf2NmJDW0HpxE/8/TFCAQ8EAQAAAAEQBP3///8iFcFQFxCL7OqN7cUwC7IjhrOrMDZ6wmL5zl5YMm64Pjoi9SMgaxbowfl5+kzA8FtqMAr//5QUWbbyDed95VsBYO+OTKyswCEWUBcQi+zqje3FMAuyI4azqzA2esJi+c5eWDJuuD46IvUdAHYiOm4wAACAAQAAgAAAAIACAACAAAAAAAAAAAAhFmsW6MH5efpMwPBbajAK//+UFFm28g3nfeVbAWDvjkysPQEJLtoDNhfiEO5/fQ43ikBK6hxItWqhAwIr7Pd0bkcApPWswv0wAACAAQAAgAAAAIACAACAAAAAAAAAAAABFyBQFxCL7OqN7cUwC7IjhrOrMDZ6wmL5zl5YMm64Pjoi9QEYIAku2gM2F+IQ7n99DjeKQErqHEi1aqEDAivs93RuRwCkAAEDCDkFAAAAAAAAAQQWABSqjvN0yvrfynaQLdtc9hxgu/2dhQA=",
      "base64",
    );

    const psbt = new PsbtV2();
    psbt.deserialize(psbtV0);

    expect(psbt.serialize()).toEqual(psbtV2);
  });
});
