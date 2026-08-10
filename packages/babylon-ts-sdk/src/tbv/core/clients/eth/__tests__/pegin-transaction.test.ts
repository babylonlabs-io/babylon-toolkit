import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";

import { calculateBtcTxHash } from "../../../utils/transaction/btcTxHash";
import { calculatePeginTxHash, derivePeginVaultId } from "../pegin-transaction";

function testTransaction(withWitness: boolean): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.addInput(Buffer.alloc(32, 0xab), 3);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 50_000);
  if (withWitness) {
    transaction.setWitness(0, [Buffer.alloc(64, 0x11), Buffer.alloc(33, 0x22)]);
  }
  return transaction.toHex();
}

describe("ETH-only pegin transaction derivation", () => {
  it("matches bitcoinjs-lib txid calculation for a legacy transaction", () => {
    const txHex = testTransaction(false);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("strips witness data and matches bitcoinjs-lib for a SegWit transaction", () => {
    const txHex = testTransaction(true);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("rejects malformed and trailing transaction bytes", () => {
    expect(() => calculatePeginTxHash("deadbeef")).toThrow(/Truncated/);
    expect(() => calculatePeginTxHash(`${testTransaction(false)}00`)).toThrow(
      /trailing byte/,
    );
    const legacy = testTransaction(false);
    const nonCanonicalInputCount = `${legacy.slice(0, 8)}fd0100${legacy.slice(10)}`;
    expect(() => calculatePeginTxHash(nonCanonicalInputCount)).toThrow(
      /Non-canonical input count/,
    );
  });

  it("matches the Solidity/Rust vault-ID golden vector", () => {
    expect(
      derivePeginVaultId(
        `0x${"ab".repeat(32)}`,
        "0x1234567890abcdef1234567890abcdef12345678",
      ),
    ).toBe(
      "0xf8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba",
    );
  });
});
