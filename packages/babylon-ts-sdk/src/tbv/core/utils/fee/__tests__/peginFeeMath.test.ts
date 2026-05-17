/**
 * Pre-PegIn fee math fixtures.
 *
 * Each fixture pins one invariant about the change-output policy and the
 * base/change-output fee split. The whole table is also evaluated against
 * the live `selectUtxosForPegin` and `fundPeginTransaction` decisions in
 * their respective suites — when both routes agree on `(fee,
 * emitChangeOutput, changeAmount)` the selector and funder cannot drift.
 *
 * Constants (taken from `../constants.ts`) used to build expected values
 * inline so the fixtures stay readable:
 *   P2TR_INPUT_SIZE          = 58
 *   MAX_NON_LEGACY_OUTPUT_SIZE = 43
 *   TX_BUFFER_SIZE_OVERHEAD  = 11
 *   DUST_THRESHOLD           = 546n
 *   LOW_RATE_ESTIMATION_BUFFER = 30 (when feeRate ≤ 2)
 */

import { describe, expect, it } from "vitest";

import {
  applyChangeOutputPolicy,
  computeChangeOutputFeeSats,
  computeMaxDeposit,
  computePeginBaseFeeSats,
} from "../peginFeeMath";

describe("computePeginBaseFeeSats", () => {
  it("computes (numInputs × 58 + numOutputs × 43 + 11) × feeRate at fee rate > 2", () => {
    // 2 inputs, 2 outputs, 5 sat/vB → vsize = 116 + 86 + 11 = 213 → fee = 1065
    expect(
      computePeginBaseFeeSats({ numInputs: 2, numOutputs: 2, feeRate: 5 }),
    ).toBe(1065n);
  });

  it("adds the low-fee-rate buffer (30 sats) when feeRate ≤ 2", () => {
    // 1 input, 2 outputs, 2 sat/vB → vsize = 58 + 86 + 11 = 155 → 310 + 30 = 340
    expect(
      computePeginBaseFeeSats({ numInputs: 1, numOutputs: 2, feeRate: 2 }),
    ).toBe(340n);
  });

  it("ceils a fractional fee rate", () => {
    // 1 input, 1 output, 1.5 sat/vB → vsize = 58 + 43 + 11 = 112 → ceil(168) + 30 = 198
    expect(
      computePeginBaseFeeSats({ numInputs: 1, numOutputs: 1, feeRate: 1.5 }),
    ).toBe(198n);
  });

  it("rejects non-integer or negative numInputs", () => {
    expect(() =>
      computePeginBaseFeeSats({ numInputs: -1, numOutputs: 2, feeRate: 5 }),
    ).toThrow(/numInputs/);
    expect(() =>
      computePeginBaseFeeSats({ numInputs: 1.5, numOutputs: 2, feeRate: 5 }),
    ).toThrow(/numInputs/);
  });

  it("rejects numOutputs < 1", () => {
    expect(() =>
      computePeginBaseFeeSats({ numInputs: 1, numOutputs: 0, feeRate: 5 }),
    ).toThrow(/numOutputs/);
  });
});

describe("computeChangeOutputFeeSats", () => {
  it("returns ceil(43 × feeRate) — does not include the low-rate buffer", () => {
    expect(computeChangeOutputFeeSats(5)).toBe(215n);
    expect(computeChangeOutputFeeSats(2)).toBe(86n);
    expect(computeChangeOutputFeeSats(1.5)).toBe(65n);
  });
});

describe("applyChangeOutputPolicy", () => {
  // Helper: a uniform set of parameters built from the SDK's own
  // primitives, so the fixture stays in sync with the constants.
  const baseFeeFor = (numInputs: number, numOutputs: number, feeRate: number) =>
    computePeginBaseFeeSats({ numInputs, numOutputs, feeRate });
  const changeFeeFor = (feeRate: number) => computeChangeOutputFeeSats(feeRate);

  it("Fixture 1 — single-input, single-vault, change < 546: dust-revert (no change output)", () => {
    // 1 input, 2 outputs (vault + CPFP), feeRate=5 → baseFee = (58+86+11)*5 = 775
    // changeOutputFee = 215. Pick totalInputValue / peginAmount so that
    // residualBeforeChange = 750, residualWithChangeOutput = 535 ≤ 546.
    // Reported fee is the on-wire fee (baseFee + absorbed dust = 775 + 750 = 1525).
    const baseFee = baseFeeFor(1, 2, 5);
    const changeOutputFee = changeFeeFor(5);
    const totalInputValue = 100_000n;
    const peginAmount = totalInputValue - baseFee - 750n; // residual = 750

    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    expect(result.emitChangeOutput).toBe(false);
    expect(result.fee).toBe(baseFee + 750n);
    expect(result.changeAmount).toBe(0n);
  });

  it("Fixture 2 — change exactly at the dust threshold: dust-revert (boundary is exclusive)", () => {
    const baseFee = baseFeeFor(1, 2, 5);
    const changeOutputFee = changeFeeFor(5);
    // residualWithChangeOutput == 546 → policy is `>` 546 → revert. The
    // residual absorbed into the fee is `changeOutputFee + 546`.
    const totalInputValue = 100_000n;
    const peginAmount = totalInputValue - baseFee - changeOutputFee - 546n;

    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    expect(result.emitChangeOutput).toBe(false);
    expect(result.fee).toBe(baseFee + changeOutputFee + 546n);
    expect(result.changeAmount).toBe(0n);
  });

  it("Fixture 3 — change > 546: emit change output, fee = base + changeOutputFee", () => {
    const baseFee = baseFeeFor(1, 2, 5);
    const changeOutputFee = changeFeeFor(5);
    const totalInputValue = 100_000n;
    const peginAmount = totalInputValue - baseFee - changeOutputFee - 1000n;

    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    expect(result.emitChangeOutput).toBe(true);
    expect(result.fee).toBe(baseFee + changeOutputFee);
    expect(result.changeAmount).toBe(1000n);
  });

  it("Fixture 4 — boundary bug: residual > 546 BEFORE change-output fee but ≤ 546 AFTER → dust-revert", () => {
    // This is the exact regression PR-3b is also pinned against. Without
    // the dust-revert, the selector pays for a change output that the
    // funder then omits — i.e. silent overpayment. Reported fee is the
    // actual on-wire fee (baseFee + absorbed 700 sats).
    const baseFee = baseFeeFor(2, 2, 5);
    const changeOutputFee = changeFeeFor(5);
    // Pick numbers so residualBeforeChange = 700 (> 546) but
    // residualWithChangeOutput = 700 - 215 = 485 (≤ 546).
    const totalInputValue = 100_000n;
    const peginAmount = totalInputValue - baseFee - 700n;

    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    expect(result.emitChangeOutput).toBe(false);
    expect(result.fee).toBe(baseFee + 700n);
    expect(result.changeAmount).toBe(0n);
  });

  it("Fixture 5 — two-vault batch: numOutputs raises base fee, change decision still consistent", () => {
    // Same residual policy, just larger output budget.
    const numOutputs = 3; // 2 vault HTLCs + CPFP anchor
    const baseFee = baseFeeFor(1, numOutputs, 5);
    const changeOutputFee = changeFeeFor(5);
    const totalInputValue = 100_000n;
    const peginAmount = totalInputValue - baseFee - changeOutputFee - 2000n;

    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });

    expect(result.emitChangeOutput).toBe(true);
    expect(result.fee).toBe(baseFee + changeOutputFee);
    expect(result.changeAmount).toBe(2000n);
  });

  it("Fixture 6 — auth-anchor adds an output → base fee scales by one extra MAX_NON_LEGACY_OUTPUT_SIZE", () => {
    // 1 vault HTLC + CPFP anchor + auth-anchor OP_RETURN = 3 outputs
    const baseWithoutAnchor = baseFeeFor(1, 2, 5);
    const baseWithAnchor = baseFeeFor(1, 3, 5);
    expect(baseWithAnchor - baseWithoutAnchor).toBe(43n * 5n);
  });

  it("Fixture 7 — sweep: peginAmount = totalBalance - baseFee → no change emitted", () => {
    // computeMaxDeposit assumes no change output; applyChangeOutputPolicy
    // must agree when fed the same numbers.
    const numInputs = 3;
    const numOutputs = 2;
    const feeRate = 5;
    const totalBalance = 50_000n;
    const baseFee = baseFeeFor(numInputs, numOutputs, feeRate);
    const peginAmount = computeMaxDeposit({
      numInputs,
      numOutputs,
      totalBalance,
      feeRate,
    });
    expect(peginAmount).not.toBeNull();

    const result = applyChangeOutputPolicy({
      totalInputValue: totalBalance,
      peginAmount: peginAmount!,
      baseFee,
      changeOutputFee: changeFeeFor(feeRate),
    });

    expect(result.emitChangeOutput).toBe(false);
    expect(result.changeAmount).toBe(0n);
    expect(result.fee).toBe(baseFee);
  });

  it("Fixture 8 — low fee rate: base fee includes the +30 buffer; change-output fee does not", () => {
    const baseFee = baseFeeFor(1, 2, 1);
    const changeOutputFee = changeFeeFor(1);
    // (58 + 86 + 11) * 1 + 30 = 185
    expect(baseFee).toBe(185n);
    // 43 * 1 = 43 (no extra buffer on change-output increment)
    expect(changeOutputFee).toBe(43n);

    const totalInputValue = 10_000n;
    const peginAmount = totalInputValue - baseFee - changeOutputFee - 800n;
    const result = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount,
      baseFee,
      changeOutputFee,
    });
    expect(result.emitChangeOutput).toBe(true);
    expect(result.fee).toBe(baseFee + changeOutputFee);
    expect(result.changeAmount).toBe(800n);
  });

  it("Fixture 9 — JS-vs-Rust parity: 546-sat dust threshold matches the wallet-side check", () => {
    // The Rust dust check in
    // `babylon-vault/crates/btc-wallet-remote/src/client.rs` rejects any
    // change output ≤ 546 sats. This test pins the JS side to the same
    // boundary — change of 547 is emitted, change of 546 is absorbed
    // into the fee. The output-sizing constants and safety margins are
    // intentionally NOT cross-stack guarantees; only the dust boundary
    // is.
    const baseFee = baseFeeFor(1, 2, 5);
    const changeOutputFee = changeFeeFor(5);
    const totalInputValue = 100_000n;

    // Just-above-dust → emit change.
    const peginAbove =
      totalInputValue - baseFee - changeOutputFee - 547n;
    const above = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount: peginAbove,
      baseFee,
      changeOutputFee,
    });
    expect(above.emitChangeOutput).toBe(true);
    expect(above.changeAmount).toBe(547n);

    // Exactly-at-dust → revert to base fee, no change output.
    const peginAt = totalInputValue - baseFee - changeOutputFee - 546n;
    const at = applyChangeOutputPolicy({
      totalInputValue,
      peginAmount: peginAt,
      baseFee,
      changeOutputFee,
    });
    expect(at.emitChangeOutput).toBe(false);
    expect(at.changeAmount).toBe(0n);
  });

  it("throws when totalInputValue cannot cover peginAmount + baseFee", () => {
    expect(() =>
      applyChangeOutputPolicy({
        totalInputValue: 100n,
        peginAmount: 90n,
        baseFee: 50n,
        changeOutputFee: 10n,
      }),
    ).toThrow(/insufficient funds/);
  });
});

describe("computeMaxDeposit", () => {
  it("returns null when totalBalance <= 0", () => {
    expect(
      computeMaxDeposit({
        numInputs: 1,
        numOutputs: 2,
        totalBalance: 0n,
        feeRate: 5,
      }),
    ).toBeNull();
  });

  it("returns totalBalance - baseFee when fee fits", () => {
    const baseFee = computePeginBaseFeeSats({
      numInputs: 1,
      numOutputs: 2,
      feeRate: 5,
    });
    expect(
      computeMaxDeposit({
        numInputs: 1,
        numOutputs: 2,
        totalBalance: 10_000n,
        feeRate: 5,
      }),
    ).toBe(10_000n - baseFee);
  });

  it("returns 0n when base fee alone exceeds balance", () => {
    expect(
      computeMaxDeposit({
        numInputs: 5,
        numOutputs: 5,
        totalBalance: 50n,
        feeRate: 5,
      }),
    ).toBe(0n);
  });

  it("does not include the change-output fee (upper bound assumes no change)", () => {
    const baseFee = computePeginBaseFeeSats({
      numInputs: 1,
      numOutputs: 2,
      feeRate: 5,
    });
    const max = computeMaxDeposit({
      numInputs: 1,
      numOutputs: 2,
      totalBalance: 10_000n,
      feeRate: 5,
    });
    expect(max).toBe(10_000n - baseFee);
  });
});
