/** Tests for generic UTXO selection utilities. */

import { describe, expect, it } from "vitest";

import {
  extractInputUtxoRefs,
  filterUtxos,
  selectAvailableUtxos,
  utxoRefKeysToArray,
  utxoRefToKey,
} from "../utxoSelection";

/** Minimal UTXO interface for testing. */
interface TestUTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
}

describe("UTXO Selection Utilities", () => {
  describe("utxoRefToKey", () => {
    it("should create lowercase key in txid:vout format", () => {
      const key = utxoRefToKey(
        "ABCD1234abcd1234ABCD1234abcd1234ABCD1234abcd1234ABCD1234abcd1234",
        0,
      );

      expect(key).toBe(
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:0",
      );
    });

    it("should handle various vout values", () => {
      const txid =
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

      expect(utxoRefToKey(txid, 0)).toBe(`${txid}:0`);
      expect(utxoRefToKey(txid, 1)).toBe(`${txid}:1`);
      expect(utxoRefToKey(txid, 255)).toBe(`${txid}:255`);
    });
  });

  describe("extractInputUtxoRefs", () => {
    // Use a real Bitcoin transaction hex for testing
    // This is a simple legacy transaction (non-segwit) with 1 input and 1 output
    // Structure:
    // - Version: 01000000 (version 1)
    // - Input count: 01
    // - Prev txid (32 bytes, LE): 813f79011acb80925dfe69b3def355fe914bd1d96a3f5f71bf8303c6a989c7d1
    // - Prev vout: 00000000
    // - ScriptSig length: 6b (107 bytes)
    // - ScriptSig: 483045...
    // - Sequence: ffffffff
    // - Output count: 01
    // - Value: 605af40500000000 (100000000 satoshis = 1 BTC in LE)
    // - ScriptPubKey length: 19 (25 bytes)
    // - ScriptPubKey: 76a914...88ac
    // - Locktime: 00000000
    const VALID_LEGACY_TX_HEX =
      "0100000001" + // version (4 bytes LE) + input count (1 byte)
      "d1c789a9c60383bf715f3f6ad9d14b91fe55f3deb369fe5d9280cb1a01793f81" + // prev txid (32 bytes LE)
      "00000000" + // prev vout (4 bytes LE) = 0
      "6b" + // scriptSig length = 107
      "483045022100884d142d86652a3f47ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e381301210484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade8416ab9fe423cc5" + // scriptSig
      "ffffffff" + // sequence
      "01" + // output count
      "605af40500000000" + // value (8 bytes LE) = 100000000
      "19" + // scriptPubKey length = 25
      "76a914887c6824d03eb8997b1e28c1d81b4e5c8c96d41688ac" + // scriptPubKey (P2PKH)
      "00000000"; // locktime

    it("should extract input outpoints from valid transaction hex", () => {
      const outpoints = extractInputUtxoRefs(VALID_LEGACY_TX_HEX);

      expect(outpoints).toHaveLength(1);
      // The txid should be byte-reversed from the input (LE to BE)
      // Input LE: d1c789a9c60383bf715f3f6ad9d14b91fe55f3deb369fe5d9280cb1a01793f81
      // Output BE: 813f79011acb80925dfe69b3def355fe914bd1d96a3f5f71bf8303c6a989c7d1
      expect(outpoints[0].txid).toBe(
        "813f79011acb80925dfe69b3def355fe914bd1d96a3f5f71bf8303c6a989c7d1",
      );
      expect(outpoints[0].vout).toBe(0);
    });

    it("should handle 0x prefix", () => {
      const txHex = "0x" + VALID_LEGACY_TX_HEX;

      const outpoints = extractInputUtxoRefs(txHex);

      expect(outpoints).toHaveLength(1);
      expect(outpoints[0].vout).toBe(0);
    });

    it("should return empty array for invalid hex", () => {
      const result = extractInputUtxoRefs("invalid-hex");

      expect(result).toEqual([]);
    });

    it("should return empty array for empty string", () => {
      const result = extractInputUtxoRefs("");

      expect(result).toEqual([]);
    });

    it("should return empty array for truncated transaction", () => {
      const result = extractInputUtxoRefs("02000000");

      expect(result).toEqual([]);
    });
  });

  describe("filterUtxos", () => {
    const mockUTXOs: TestUTXO[] = [
      { txid: "txid1", vout: 0, value: 50000, scriptPubKey: "script1" },
      { txid: "txid2", vout: 1, value: 100000, scriptPubKey: "script2" },
      { txid: "txid3", vout: 0, value: 75000, scriptPubKey: "script3" },
      { txid: "txid4", vout: 2, value: 200000, scriptPubKey: "script4" },
    ];

    it("should filter out reserved outpoints", () => {
      const reserved = new Set(["txid1:0", "txid3:0"]);

      const filtered = filterUtxos(mockUTXOs, reserved);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((u) => u.txid)).toEqual(["txid2", "txid4"]);
    });

    it("should return all UTXOs when no reserved outpoints", () => {
      const reserved = new Set<string>();

      const filtered = filterUtxos(mockUTXOs, reserved);

      expect(filtered).toHaveLength(4);
      expect(filtered).toEqual(mockUTXOs);
    });

    it("should return empty array when all UTXOs are reserved", () => {
      const reserved = new Set(["txid1:0", "txid2:1", "txid3:0", "txid4:2"]);

      const filtered = filterUtxos(mockUTXOs, reserved);

      expect(filtered).toHaveLength(0);
    });

    it("should not match when reserved set contains uppercase keys", () => {
      const reserved = new Set(["TXID1:0"]); // Uppercase in reserved set

      // filterUtxos uses utxoRefToKey which lowercases the UTXO txid to "txid1:0",
      // but Set lookup is case-sensitive, so "txid1:0" won't match "TXID1:0"
      const filtered = filterUtxos(mockUTXOs, reserved);

      // No match because Set lookup is case-sensitive: lowercase "txid1:0" ≠ uppercase "TXID1:0"
      // To ensure matching, the reserved set keys should also be normalized to lowercase
      expect(filtered).toHaveLength(4);
    });

    it("should not modify original array", () => {
      const reserved = new Set(["txid1:0"]);
      const originalLength = mockUTXOs.length;

      filterUtxos(mockUTXOs, reserved);

      expect(mockUTXOs).toHaveLength(originalLength);
    });

    it("should handle empty UTXO array", () => {
      const reserved = new Set(["txid1:0"]);

      const filtered = filterUtxos([], reserved);

      expect(filtered).toHaveLength(0);
    });
  });

  describe("utxoRefKeysToArray", () => {
    it("should convert outpoint keys to Outpoint array", () => {
      const keys = new Set(["txid1:0", "txid2:1", "txid3:255"]);

      const outpoints = utxoRefKeysToArray(keys);

      expect(outpoints).toHaveLength(3);
      expect(outpoints).toContainEqual({ txid: "txid1", vout: 0 });
      expect(outpoints).toContainEqual({ txid: "txid2", vout: 1 });
      expect(outpoints).toContainEqual({ txid: "txid3", vout: 255 });
    });

    it("should handle empty set", () => {
      const keys = new Set<string>();

      const outpoints = utxoRefKeysToArray(keys);

      expect(outpoints).toHaveLength(0);
    });

    it("should skip malformed keys", () => {
      const keys = new Set(["txid1:0", "malformed", "txid2:abc", "txid3:1"]);

      const outpoints = utxoRefKeysToArray(keys);

      expect(outpoints).toHaveLength(2);
      expect(outpoints).toContainEqual({ txid: "txid1", vout: 0 });
      expect(outpoints).toContainEqual({ txid: "txid3", vout: 1 });
    });
  });

  describe("selectAvailableUtxos", () => {
    const mockUTXOs: TestUTXO[] = [
      { txid: "txid1", vout: 0, value: 50000, scriptPubKey: "script1" },
      { txid: "txid2", vout: 1, value: 100000, scriptPubKey: "script2" },
      { txid: "txid3", vout: 0, value: 75000, scriptPubKey: "script3" },
      { txid: "txid4", vout: 2, value: 200000, scriptPubKey: "script4" },
    ];

    it("should return all UTXOs when no reserved refs", () => {
      const result = selectAvailableUtxos({
        availableUtxos: mockUTXOs,
        reservedUtxoRefs: new Set(),
      });

      expect(result.utxos).toHaveLength(4);
      expect(result.usedFallback).toBe(false);
    });

    it("should filter out reserved UTXOs", () => {
      const reserved = new Set(["txid1:0", "txid3:0"]);

      const result = selectAvailableUtxos({
        availableUtxos: mockUTXOs,
        reservedUtxoRefs: reserved,
      });

      expect(result.utxos).toHaveLength(2);
      expect(result.utxos.map((u) => u.txid)).toEqual(["txid2", "txid4"]);
      expect(result.usedFallback).toBe(false);
    });

    it("should fallback to all UTXOs when all are reserved", () => {
      const reserved = new Set(["txid1:0", "txid2:1", "txid3:0", "txid4:2"]);

      const result = selectAvailableUtxos({
        availableUtxos: mockUTXOs,
        reservedUtxoRefs: reserved,
      });

      expect(result.utxos).toHaveLength(4);
      expect(result.utxos).toEqual(mockUTXOs);
      expect(result.usedFallback).toBe(true);
    });

    it("should return empty array when no UTXOs available", () => {
      const result = selectAvailableUtxos({
        availableUtxos: [],
        reservedUtxoRefs: new Set(["txid1:0"]),
      });

      expect(result.utxos).toHaveLength(0);
      expect(result.usedFallback).toBe(false);
    });

    it("should handle partial reservation without fallback", () => {
      const reserved = new Set(["txid1:0"]);

      const result = selectAvailableUtxos({
        availableUtxos: mockUTXOs,
        reservedUtxoRefs: reserved,
      });

      expect(result.utxos).toHaveLength(3);
      expect(result.utxos.map((u) => u.txid)).toEqual([
        "txid2",
        "txid3",
        "txid4",
      ]);
      expect(result.usedFallback).toBe(false);
    });
  });
});
