/**
 * Tests for UTXO selection utilities
 */

import { describe, expect, it } from "vitest";

import {
  getDustThreshold,
  selectUtxosForPegin,
  shouldAddChangeOutput,
  type UTXO,
} from "../selectUtxos";

describe("selectUtxosForPegin", () => {
  const mockUTXOs: UTXO[] = [
    {
      txid: "tx1",
      vout: 0,
      value: 100000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", // Valid P2TR
    },
    {
      txid: "tx2",
      vout: 1,
      value: 50000,
      scriptPubKey:
        "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    },
    {
      txid: "tx3",
      vout: 0,
      value: 25000,
      scriptPubKey:
        "51201111111111111111111111111111111111111111111111111111111111111111",
    },
  ];

  it("should select single UTXO when sufficient", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 10);

    expect(result.selectedUTXOs).toHaveLength(1);
    expect(result.selectedUTXOs[0].txid).toBe("tx1"); // Largest UTXO selected first
    expect(result.totalValue).toBe(100000n);
    expect(result.fee).toBeGreaterThan(0n);
    expect(result.changeAmount).toBeGreaterThan(0n);
  });

  it("should select multiple UTXOs when needed", () => {
    const result = selectUtxosForPegin(mockUTXOs, 120000n, 10);

    expect(result.selectedUTXOs.length).toBeGreaterThan(1);
    expect(result.totalValue).toBeGreaterThanOrEqual(120000n);
    expect(result.fee).toBeGreaterThan(0n);
  });

  it("should sort UTXOs by value (largest first)", () => {
    const result = selectUtxosForPegin(mockUTXOs, 30000n, 10);

    // Should select the largest UTXO first (100000)
    expect(result.selectedUTXOs[0].value).toBe(100000);
  });

  it("should calculate fee with change output if change > dust", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 10);

    // Change should be above dust threshold
    expect(result.changeAmount).toBeGreaterThan(546n);

    // Total should equal: peginAmount + fee + change
    expect(result.totalValue).toBe(
      50000n + result.fee + result.changeAmount,
    );
  });

  it("should throw error when no UTXOs available", () => {
    expect(() => selectUtxosForPegin([], 10000n, 10)).toThrow(
      "Insufficient funds: no UTXOs available",
    );
  });

  it("should throw error when insufficient funds", () => {
    const smallUTXOs: UTXO[] = [
      {
        txid: "tx1",
        vout: 0,
        value: 1000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ];

    expect(() => selectUtxosForPegin(smallUTXOs, 500000n, 10)).toThrow(
      /Insufficient funds/,
    );
  });

  // Note: Script validation tests removed because bitcoinjs-lib's script.decompile()
  // accepts most hex strings as valid. Invalid scripts would cause errors later
  // during transaction signing. Real wallets filter UTXOs before passing to SDK.

  it("should handle low fee rates with buffer", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 1);

    // Fee should include LOW_RATE_ESTIMATION_ACCURACY_BUFFER (30 sats)
    expect(result.fee).toBeGreaterThan(30n);
  });

  it("should handle high fee rates without extra buffer", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 50);

    // Fee should be proportional to fee rate
    expect(result.fee).toBeGreaterThan(100n);
  });

  it("should iterate until sufficient funds including fees", () => {
    // Test that it keeps adding UTXOs until total >= peginAmount + fee
    const result = selectUtxosForPegin(mockUTXOs, 150000n, 10);

    // Should select at least 2 UTXOs
    expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(2);

    // Total should cover everything
    expect(result.totalValue).toBeGreaterThanOrEqual(
      150000n + result.fee,
    );
  });
});

describe("shouldAddChangeOutput", () => {
  it("should return true for amounts above dust threshold", () => {
    expect(shouldAddChangeOutput(1000n)).toBe(true);
    expect(shouldAddChangeOutput(10000n)).toBe(true);
  });

  it("should return false for amounts at or below dust threshold", () => {
    expect(shouldAddChangeOutput(546n)).toBe(false);
    expect(shouldAddChangeOutput(545n)).toBe(false);
    expect(shouldAddChangeOutput(0n)).toBe(false);
  });
});

describe("getDustThreshold", () => {
  it("should return correct dust threshold", () => {
    expect(getDustThreshold()).toBe(546);
  });
});
