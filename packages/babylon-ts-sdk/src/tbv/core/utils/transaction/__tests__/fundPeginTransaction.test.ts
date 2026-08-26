/**
 * Tests for transaction funding utilities
 */

import * as bitcoin from "bitcoinjs-lib";
import { describe, expect, it } from "vitest";

import type { UTXO } from "../../utxo/selectUtxos";
import { fundPeginTransaction, getNetwork } from "../fundPeginTransaction";

describe("fundPeginTransaction", () => {
  const mockUTXOs: UTXO[] = [
    {
      txid: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      vout: 0,
      value: 100000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    },
  ];

  // Mock unfunded transaction hex (witness format, 0 inputs, 1 output)
  // Version (4) + Marker (00) + Flag (01) + Input count (00) + Output count (01)
  // + Value (8 bytes LE) + ScriptLen (1) + Script (34 bytes) + Locktime (4)
  const mockUnfundedTxHex =
    "02000000" + // version
    "0001" + // witness marker and flag
    "00" + // 0 inputs
    "01" + // 1 output
    "a086010000000000" + // 100000 sats (LE)
    "22" + // script length (34 bytes)
    "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" +
    "00000000"; // locktime

  it("should fund transaction with inputs and change output", () => {
    const result = fundPeginTransaction({
      unfundedTxHex: mockUnfundedTxHex,
      selectedUTXOs: mockUTXOs,
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10000n,
      network: bitcoin.networks.testnet,
    });

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);

    // Parse the transaction to verify structure
    const tx = bitcoin.Transaction.fromHex(result);

    // Should have 1 input (from mockUTXOs)
    expect(tx.ins.length).toBe(1);

    // Should have 2 outputs (vault + change)
    expect(tx.outs.length).toBe(2);

    // First output should be vault output (100000 sats)
    expect(tx.outs[0].value).toBe(100000);

    // Second output should be change (10000 sats)
    expect(tx.outs[1].value).toBe(10000);
  });

  it("should fund transaction without change output when changeAmount is 0n", () => {
    // The selector signals "no change emitted" by returning 0n. The funder
    // trusts that decision rather than re-checking the dust threshold —
    // re-checking would let a hand-built `changeAmount` between 0 and dust
    // bypass the canonical fee policy and silently underpay.
    const result = fundPeginTransaction({
      unfundedTxHex: mockUnfundedTxHex,
      selectedUTXOs: mockUTXOs,
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 0n,
      network: bitcoin.networks.testnet,
    });

    const tx = bitcoin.Transaction.fromHex(result);

    expect(tx.ins.length).toBe(1);
    // Only the vault output — no change emitted.
    expect(tx.outs.length).toBe(1);
    expect(tx.outs[0].value).toBe(100000);
  });

  it("rejects negative changeAmount (selector contract violation)", () => {
    expect(() =>
      fundPeginTransaction({
        unfundedTxHex: mockUnfundedTxHex,
        selectedUTXOs: mockUTXOs,
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: -1n,
        network: bitcoin.networks.testnet,
      }),
    ).toThrow(/changeAmount cannot be negative/);
  });

  it("rejects sub-dust positive changeAmount (would produce a non-relayable output)", () => {
    // Public-API contract guard: a hand-built or stale changeAmount in
    // (0, DUST_THRESHOLD] must throw rather than silently produce a dust
    // output — otherwise relays drop the tx and the user sees a confusing
    // failure later in the broadcast pipeline.
    expect(() =>
      fundPeginTransaction({
        unfundedTxHex: mockUnfundedTxHex,
        selectedUTXOs: mockUTXOs,
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: 100n,
        network: bitcoin.networks.testnet,
      }),
    ).toThrow(/strictly above DUST_THRESHOLD/);

    // Boundary: exactly at DUST_THRESHOLD also rejected.
    expect(() =>
      fundPeginTransaction({
        unfundedTxHex: mockUnfundedTxHex,
        selectedUTXOs: mockUTXOs,
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: 546n,
        network: bitcoin.networks.testnet,
      }),
    ).toThrow(/strictly above DUST_THRESHOLD/);
  });

  it("should fund transaction with multiple UTXOs", () => {
    const multipleUTXOs: UTXO[] = [
      {
        txid: "1111111111111111111111111111111111111111111111111111111111111111",
        vout: 0,
        value: 50000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      {
        txid: "2222222222222222222222222222222222222222222222222222222222222222",
        vout: 1,
        value: 60000,
        scriptPubKey:
          "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      },
    ];

    const result = fundPeginTransaction({
      unfundedTxHex: mockUnfundedTxHex,
      selectedUTXOs: multipleUTXOs,
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 5000n,
      network: bitcoin.networks.testnet,
    });

    const tx = bitcoin.Transaction.fromHex(result);

    // Should have 2 inputs
    expect(tx.ins.length).toBe(2);

    // Should have 2 outputs (vault + change)
    expect(tx.outs.length).toBe(2);
  });

  it("should preserve version and locktime from unfunded tx", () => {
    const result = fundPeginTransaction({
      unfundedTxHex: mockUnfundedTxHex,
      selectedUTXOs: mockUTXOs,
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10000n,
      network: bitcoin.networks.testnet,
    });

    const tx = bitcoin.Transaction.fromHex(result);

    // Version should be 2
    expect(tx.version).toBe(2);

    // Locktime should be 0
    expect(tx.locktime).toBe(0);
  });

  it("should reverse UTXO txid for Bitcoin byte order", () => {
    const result = fundPeginTransaction({
      unfundedTxHex: mockUnfundedTxHex,
      selectedUTXOs: mockUTXOs,
      changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
      changeAmount: 10000n,
      network: bitcoin.networks.testnet,
    });

    const tx = bitcoin.Transaction.fromHex(result);

    // The input should have reversed txid
    const inputTxid = tx.ins[0].hash.reverse().toString("hex");
    expect(inputTxid).toBe(mockUTXOs[0].txid);
  });

  it("should throw error for unfunded tx with non-zero inputs", () => {
    // Mock tx with 1 input (invalid for our use case)
    const invalidTxHex =
      "02000000" + // version
      "0001" + // witness marker and flag
      "01" + // 1 input (invalid!)
      "01" + // 1 output
      "a086010000000000" +
      "22" +
      "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" +
      "00000000";

    expect(() =>
      fundPeginTransaction({
        unfundedTxHex: invalidTxHex,
        selectedUTXOs: mockUTXOs,
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: 10000n,
        network: bitcoin.networks.testnet,
      }),
    ).toThrow("Expected 0 inputs from WASM");
  });

  it("should throw error for unfunded tx with zero outputs", () => {
    // Mock tx with 0 outputs (invalid for our use case)
    const invalidTxHex =
      "02000000" +
      "0001" +
      "00" + // 0 inputs
      "00" + // 0 outputs (invalid!)
      "00000000"; // locktime

    expect(() =>
      fundPeginTransaction({
        unfundedTxHex: invalidTxHex,
        selectedUTXOs: mockUTXOs,
        changeAddress: "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx",
        changeAmount: 10000n,
        network: bitcoin.networks.testnet,
      }),
    ).toThrow("Expected at least 1 output from WASM");
  });
});

describe("getNetwork", () => {
  it("should return mainnet for 'bitcoin'", () => {
    const network = getNetwork("bitcoin");
    expect(network).toBe(bitcoin.networks.bitcoin);
  });

  it("should return testnet for 'testnet'", () => {
    const network = getNetwork("testnet");
    expect(network).toBe(bitcoin.networks.testnet);
  });

  it("should return testnet for 'signet'", () => {
    const network = getNetwork("signet");
    expect(network).toBe(bitcoin.networks.testnet);
  });

  it("should return regtest for 'regtest'", () => {
    const network = getNetwork("regtest");
    expect(network).toBe(bitcoin.networks.regtest);
  });
});
