// Hand-rolled legacy tx hex — bitcoinjs-lib's `Transaction.addInput`
// rejects the polyfilled Buffer in this test env via typeforce.

import { describe, expect, it } from "vitest";

import { parseFundingOutpointsFromTx } from "../parseFundingOutpoints";

const TXID_DISPLAY_HEX_1 =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TXID_DISPLAY_HEX_2 =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function reverseHex(hex: string): string {
  return bytesToHex(hexToBytes(hex).reverse());
}

function uint32LeHex(n: number): string {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, n, true);
  return bytesToHex(buf);
}

/** Build a minimal legacy (non-segwit) Bitcoin tx hex. */
function buildTxHex(inputs: Array<{ txid: string; vout: number }>): string {
  const version = "02000000";
  const inputCountByte = inputs.length.toString(16).padStart(2, "0");
  const inputsHex = inputs
    .map(({ txid, vout }) => {
      const prevTxidWire = reverseHex(txid);
      const voutLe = uint32LeHex(vout);
      const scriptSigLen = "00";
      const sequence = "ffffffff";
      return prevTxidWire + voutLe + scriptSigLen + sequence;
    })
    .join("");
  const outputCount = "01";
  const value = "a086010000000000";
  const scriptPubKey = "16" + "0014" + "00".repeat(20);
  const locktime = "00000000";
  return (
    version +
    inputCountByte +
    inputsHex +
    outputCount +
    value +
    scriptPubKey +
    locktime
  );
}

describe("parseFundingOutpointsFromTx", () => {
  it("extracts a single outpoint with display-order txid", () => {
    const txHex = buildTxHex([{ txid: TXID_DISPLAY_HEX_1, vout: 0 }]);
    const outpoints = parseFundingOutpointsFromTx(txHex);
    expect(outpoints).toHaveLength(1);
    expect(outpoints[0]).toEqual({
      txid: hexToBytes(TXID_DISPLAY_HEX_1),
      vout: 0,
    });
  });

  it("preserves outpoint ordering across multiple inputs", () => {
    const txHex = buildTxHex([
      { txid: TXID_DISPLAY_HEX_1, vout: 7 },
      { txid: TXID_DISPLAY_HEX_2, vout: 12 },
    ]);
    const outpoints = parseFundingOutpointsFromTx(txHex);
    expect(outpoints).toEqual([
      { txid: hexToBytes(TXID_DISPLAY_HEX_1), vout: 7 },
      { txid: hexToBytes(TXID_DISPLAY_HEX_2), vout: 12 },
    ]);
  });

  it("strips a leading 0x prefix", () => {
    const txHex = buildTxHex([{ txid: TXID_DISPLAY_HEX_1, vout: 0 }]);
    expect(parseFundingOutpointsFromTx(`0x${txHex}`)).toEqual(
      parseFundingOutpointsFromTx(txHex),
    );
  });

  it("matches the deposit-time encoding (display-order bytes)", () => {
    // Resume MUST produce the same bytes as deposit's
    // `hexToUint8Array(selectedUTXO.txid)` so the wallet derives the
    // same vault root.
    const txHex = buildTxHex([{ txid: TXID_DISPLAY_HEX_1, vout: 3 }]);
    const [outpoint] = parseFundingOutpointsFromTx(txHex);
    expect(Array.from(outpoint.txid)).toEqual(
      Array.from(hexToBytes(TXID_DISPLAY_HEX_1)),
    );
  });

  it("throws on empty hex", () => {
    expect(() => parseFundingOutpointsFromTx("")).toThrow(
      /transaction hex is empty/i,
    );
  });

  it("throws on a transaction with no inputs", () => {
    const noInputsTxHex = "02000000" + "00" + "00" + "00000000";
    expect(() => parseFundingOutpointsFromTx(noInputsTxHex)).toThrow(
      /no inputs/i,
    );
  });

  it("propagates parser errors for malformed hex", () => {
    expect(() => parseFundingOutpointsFromTx("zzzz")).toThrow();
  });
});
