import { deriveVaultId } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { sha256 } from "@noble/hashes/sha2.js";
import { Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { bytesToHex, getAddress, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { calculateBtcTxHash } from "../../../utils/transaction/btcTxHash";
import { calculatePeginTxHash, derivePeginVaultId } from "../pegin-transaction";

const GOLDEN_PEGIN_TX_HASH: Hex = `0x${"ab".repeat(32)}`;
const GOLDEN_DEPOSITOR: Address = "0x1234567890abcdef1234567890abcdef12345678";
const GOLDEN_VAULT_ID: Hex =
  "0xf8d22e64c72a84a3dacdedb7d8b42e285bf06bd25850da911398c51d5a6c2dba";

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

// Three inputs and three outputs, a non-zero locktime, three distinct
// non-default sequences, and scripts longer than 252 bytes so input count,
// output count and the 0xfd compact-size branch are all exercised.
function multiInputOutputTransaction(withWitness: boolean): string {
  const transaction = new Transaction();
  transaction.version = 2;
  transaction.locktime = 812_345;
  transaction.addInput(Buffer.alloc(32, 0x01), 0, 0xfffffffd);
  transaction.addInput(
    Buffer.alloc(32, 0x02),
    7,
    0xfffffffe,
    Buffer.alloc(300, 0x51),
  );
  transaction.addInput(Buffer.alloc(32, 0x03), 4_294_967_295, 0);
  transaction.addOutput(Buffer.alloc(22, 0x00), 1_000);
  transaction.addOutput(Buffer.alloc(300, 0x6a), 2_000);
  transaction.addOutput(Buffer.alloc(34, 0xcd), 3_000);
  if (withWitness) {
    transaction.setWitness(0, [Buffer.alloc(64, 0x11)]);
    transaction.setWitness(2, [
      Buffer.alloc(300, 0x22),
      Buffer.alloc(33, 0x33),
    ]);
  }
  return transaction.toHex();
}

// Deterministic (peginTxHash, depositor) pairs: SHA-256 of the fixture index,
// then SHA-256 of that digest for the 20-byte address. No randomness, so a
// failure reproduces exactly.
/**
 * The two arguments are varied independently rather than walked along a
 * diagonal. `derivePeginVaultId` hashes a (bytes32, address) pair, so a fault
 * that conflates the two - deriving one from the other, using one twice, or
 * encoding them without fixed widths so two different pairs collide - agrees
 * on every point where one input already determines the other. Crossing the
 * axes is what makes those visible. The two ends of each axis cover the values
 * sha256 never emits, which is where a padding or length fault would show.
 */
function vaultIdFixtures(): { peginTxHash: Hex; depositor: Address }[] {
  // Distinct domain prefixes, so no depositor can coincide with a value
  // derived from a transaction hash.
  const peginTxHashes: Hex[] = [
    `0x${"00".repeat(32)}`,
    `0x${"ff".repeat(32)}`,
    ...Array.from({ length: 8 }, (_, index) =>
      bytesToHex(sha256(Uint8Array.of(0x01, index))),
    ),
  ];
  const depositors: Address[] = [
    getAddress(`0x${"00".repeat(20)}`),
    getAddress(`0x${"ff".repeat(20)}`),
    ...Array.from({ length: 8 }, (_, index) =>
      getAddress(bytesToHex(sha256(Uint8Array.of(0x02, index)).slice(0, 20))),
    ),
  ];

  return peginTxHashes.flatMap((peginTxHash) =>
    depositors.map((depositor) => ({ peginTxHash, depositor })),
  );
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

  it("matches bitcoinjs-lib for a multi-input, multi-output legacy transaction", () => {
    const txHex = multiInputOutputTransaction(false);
    expect(calculatePeginTxHash(txHex)).toBe(calculateBtcTxHash(txHex));
  });

  it("matches bitcoinjs-lib for a multi-input SegWit transaction with a partly empty witness", () => {
    const txHex = multiInputOutputTransaction(true);
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

  // Golden vector from the btc-vault Rust tests
  // (crates/eth-client/src/vault_id.rs): peginTxHash = [0xab; 32],
  // depositor = 0x1234567890abcdef1234567890abcdef12345678. Same literal the
  // WASM engine is pinned to in primitives/__tests__/deriveVaultId.test.ts.
  it("matches the Solidity/Rust vault-ID golden vector", () => {
    expect(derivePeginVaultId(GOLDEN_PEGIN_TX_HASH, GOLDEN_DEPOSITOR)).toBe(
      GOLDEN_VAULT_ID,
    );
  });

  it("matches the WASM deriveVaultId engine it replaces on the registration path", async () => {
    const fixtures = [
      { peginTxHash: GOLDEN_PEGIN_TX_HASH, depositor: GOLDEN_DEPOSITOR },
      ...vaultIdFixtures(),
    ];

    for (const { peginTxHash, depositor } of fixtures) {
      const engineVaultId = await deriveVaultId(peginTxHash, depositor);
      expect(derivePeginVaultId(peginTxHash, depositor).toLowerCase()).toBe(
        `0x${engineVaultId.toLowerCase()}`,
      );
    }
  });
});
