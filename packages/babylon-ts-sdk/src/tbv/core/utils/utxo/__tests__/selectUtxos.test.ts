/**
 * Tests for UTXO selection utilities
 */

import { describe, expect, it } from "vitest";

import {
  computeFundingBudget,
  FundingInputCountExceededError,
  getDustThreshold,
  isFundingInputCountExceededError,
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
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 10, 2, null);

    expect(result.selectedUTXOs).toHaveLength(1);
    expect(result.selectedUTXOs[0].txid).toBe("tx1"); // Largest UTXO selected first
    expect(result.totalValue).toBe(100000n);
    expect(result.fee).toBeGreaterThan(0n);
    expect(result.changeAmount).toBeGreaterThan(0n);
  });

  it("should select multiple UTXOs when needed", () => {
    const result = selectUtxosForPegin(mockUTXOs, 120000n, 10, 2, null);

    expect(result.selectedUTXOs.length).toBeGreaterThan(1);
    expect(result.totalValue).toBeGreaterThanOrEqual(120000n);
    expect(result.fee).toBeGreaterThan(0n);
  });

  it("should sort UTXOs by value (largest first)", () => {
    const result = selectUtxosForPegin(mockUTXOs, 30000n, 10, 2, null);

    // Should select the largest UTXO first (100000)
    expect(result.selectedUTXOs[0].value).toBe(100000);
  });

  it("should calculate fee with change output if change > dust", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 10, 2, null);

    // Change should be above dust threshold
    expect(result.changeAmount).toBeGreaterThan(546n);

    // Total should equal: peginAmount + fee + change
    expect(result.totalValue).toBe(50000n + result.fee + result.changeAmount);
  });

  it("should throw error when no UTXOs available", () => {
    expect(() => selectUtxosForPegin([], 10000n, 10, 2, null)).toThrow(
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

    expect(() => selectUtxosForPegin(smallUTXOs, 500000n, 10, 2, null)).toThrow(
      /Insufficient funds/,
    );
  });

  // Note: Script validation tests removed because bitcoinjs-lib's script.decompile()
  // accepts most hex strings as valid. Invalid scripts would cause errors later
  // during transaction signing. Real wallets filter UTXOs before passing to SDK.

  it("should handle low fee rates with buffer", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 1, 2, null);

    // Fee should include LOW_RATE_ESTIMATION_ACCURACY_BUFFER (30 sats)
    expect(result.fee).toBeGreaterThan(30n);
  });

  it("should handle high fee rates without extra buffer", () => {
    const result = selectUtxosForPegin(mockUTXOs, 50000n, 50, 2, null);

    // Fee should be proportional to fee rate
    expect(result.fee).toBeGreaterThan(100n);
  });

  it("should iterate until sufficient funds including fees", () => {
    // Test that it keeps adding UTXOs until total >= peginAmount + fee
    const result = selectUtxosForPegin(mockUTXOs, 150000n, 10, 2, null);

    // Should select at least 2 UTXOs
    expect(result.selectedUTXOs.length).toBeGreaterThanOrEqual(2);

    // Total should cover everything
    expect(result.totalValue).toBeGreaterThanOrEqual(150000n + result.fee);
  });

  it("should throw when availableUTXOs contains duplicate txid:vout entries", () => {
    const duplicateUTXOs: UTXO[] = [
      {
        txid: "tx1",
        vout: 0,
        value: 100000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      {
        txid: "tx1",
        vout: 0,
        value: 100000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ];

    expect(() =>
      selectUtxosForPegin(duplicateUTXOs, 50000n, 10, 2, null),
    ).toThrow(/Duplicate UTXO detected/);
  });

  it("should treat UTXOs with same txid but different vout as distinct", () => {
    const sameHashDifferentVout: UTXO[] = [
      {
        txid: "tx1",
        vout: 0,
        value: 100000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      {
        txid: "tx1",
        vout: 1,
        value: 50000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ];

    expect(() =>
      selectUtxosForPegin(sameHashDifferentVout, 50000n, 10, 2, null),
    ).not.toThrow();
  });

  it("should detect duplicate UTXOs case-insensitively", () => {
    const mixedCaseDuplicates: UTXO[] = [
      {
        txid: "aAbBcCdD1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        vout: 0,
        value: 100000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
      {
        txid: "AABBCCDD1234567890abcdef1234567890abcdef1234567890abcdef12345678",
        vout: 0,
        value: 100000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ];

    expect(() =>
      selectUtxosForPegin(mixedCaseDuplicates, 50000n, 10, 2, null),
    ).toThrow(/Duplicate UTXO detected/);
  });

  it("should charge higher fee for more outputs", () => {
    const feeWith2Outputs = selectUtxosForPegin(
      mockUTXOs,
      50000n,
      10,
      2,
      null,
    ).fee;
    const feeWith5Outputs = selectUtxosForPegin(
      mockUTXOs,
      50000n,
      10,
      5,
      null,
    ).fee;

    // More outputs → larger tx → higher fee
    expect(feeWith5Outputs).toBeGreaterThan(feeWith2Outputs);
  });

  it("does NOT charge for a change output it then omits at the dust boundary (regression)", () => {
    // Build inputs such that, with 2 outputs (vault + CPFP) at 5 sat/vB:
    //   baseFee = (58 + 86 + 11) * 5 = 775
    //   changeOutputFee = 43 * 5 = 215
    // Pick totalInputValue = 100_000 and choose peginAmount so that the
    // residual after baseFee is 750 sats — change-output fee would push
    // it to 535 ≤ 546 (dust). The selector must dust-revert (no change
    // output emitted), and the reported fee is the actual on-wire fee
    // (baseFee + the absorbed 750 sats).
    const single: UTXO[] = [
      {
        txid: "0000000000000000000000000000000000000000000000000000000000000001",
        vout: 0,
        value: 100_000,
        scriptPubKey:
          "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      },
    ];
    const baseFee = 775n;
    const peginAmount = 100_000n - baseFee - 750n;

    const result = selectUtxosForPegin(single, peginAmount, 5, 2, null);

    expect(result.fee).toBe(baseFee + 750n);
    expect(result.changeAmount).toBe(0n);
  });

  it("accepts a selection that needs exactly maxInputCount inputs", () => {
    // 120000 needs the two largest UTXOs (100000 + 50000).
    const result = selectUtxosForPegin(mockUTXOs, 120000n, 10, 2, 2);

    expect(result.selectedUTXOs).toHaveLength(2);
  });

  it("throws FundingInputCountExceededError when one more input than maxInputCount is needed", () => {
    let thrown: unknown;
    try {
      selectUtxosForPegin(mockUTXOs, 120000n, 10, 2, 1);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(FundingInputCountExceededError);
    expect(isFundingInputCountExceededError(thrown)).toBe(true);
    expect((thrown as FundingInputCountExceededError).maxInputCount).toBe(1);
  });

  it("reports insufficient funds, not the input bound, when the whole valid set falls short", () => {
    const smallUTXOs: UTXO[] = Array.from({ length: 25 }, (_, index) => ({
      txid: index.toString(16).padStart(64, "0"),
      vout: 0,
      value: 1_000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    }));

    let thrown: unknown;
    try {
      selectUtxosForPegin(smallUTXOs, 100_000n, 5, 2, 20);
    } catch (err) {
      thrown = err;
    }

    expect(isFundingInputCountExceededError(thrown)).toBe(false);
    expect((thrown as Error).message).toMatch(/^Insufficient funds: need /);
  });

  it("selects more inputs than any bound would allow when maxInputCount is null", () => {
    // 150000 + fee exceeds the two largest, so all three are needed.
    const result = selectUtxosForPegin(mockUTXOs, 150000n, 10, 2, null);

    expect(result.selectedUTXOs).toHaveLength(3);
  });

  it("rejects a maxInputCount that is not a positive integer", () => {
    expect(() => selectUtxosForPegin(mockUTXOs, 50000n, 10, 2, 0)).toThrow(
      "Invalid maxInputCount: expected a positive integer or null, got 0",
    );
    expect(() => selectUtxosForPegin(mockUTXOs, 50000n, 10, 2, 1.5)).toThrow(
      "Invalid maxInputCount: expected a positive integer or null, got 1.5",
    );
  });
});

describe("computeFundingBudget", () => {
  const invalidScriptUTXO: UTXO = {
    txid: "0000000000000000000000000000000000000000000000000000000000000009",
    vout: 0,
    value: 999999,
    // OP_PUSHDATA1 declaring 255 bytes that are not there — decompiles to null.
    scriptPubKey: "4cff",
  };

  const budgetUTXOs: UTXO[] = [
    {
      txid: "0000000000000000000000000000000000000000000000000000000000000001",
      vout: 0,
      value: 30000,
      scriptPubKey:
        "5120abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    },
    {
      txid: "0000000000000000000000000000000000000000000000000000000000000002",
      vout: 0,
      value: 70000,
      scriptPubKey:
        "5120fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
    },
    {
      txid: "0000000000000000000000000000000000000000000000000000000000000003",
      vout: 0,
      value: 50000,
      scriptPubKey:
        "51201111111111111111111111111111111111111111111111111111111111111111",
    },
  ];

  it("returns the top-N UTXOs by value when a bound is given", () => {
    expect(computeFundingBudget(budgetUTXOs, 2)).toEqual({
      numInputs: 2,
      totalBalance: 120000n,
    });
  });

  it("returns every valid UTXO when maxInputCount is null", () => {
    expect(computeFundingBudget(budgetUTXOs, null)).toEqual({
      numInputs: 3,
      totalBalance: 150000n,
    });
  });

  it("ignores UTXOs with undecodable scripts", () => {
    expect(
      computeFundingBudget([invalidScriptUTXO, ...budgetUTXOs], 2),
    ).toEqual({ numInputs: 2, totalBalance: 120000n });
  });

  it("returns an empty budget for an empty UTXO set", () => {
    expect(computeFundingBudget([], 5)).toEqual({
      numInputs: 0,
      totalBalance: 0n,
    });
  });

  it("rejects a maxInputCount that is not a positive integer", () => {
    expect(() => computeFundingBudget(budgetUTXOs, 0)).toThrow(
      "Invalid maxInputCount: expected a positive integer or null, got 0",
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
