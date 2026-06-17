import { describe, expect, it } from "vitest";

import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../../constants";
import { validateBorrowAction } from "../validateBorrowAction";

const HF_TOO_LOW_MESSAGE = `Borrowing this amount would drop your health factor below ${MIN_HEALTH_FACTOR_FOR_BORROW}, risking liquidation. Reduce the amount and try again.`;

describe("validateBorrowAction", () => {
  it("disables with 'Enter an amount' when borrow amount is 0", () => {
    const result = validateBorrowAction(0, Infinity, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
    });
  });

  it("disables with 'Amount too small' when the amount rounds to zero base units", () => {
    // 0.0000000001 USDC (6 decimals) -> toFixed(6) = "0.000000" -> 0n on-chain,
    // which the contract rejects with "Amount cannot be zero".
    const result = validateBorrowAction(
      0.0000000001,
      Infinity,
      10000,
      6,
      "USDC",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount too small",
      errorMessage:
        "The minimum borrowable amount is 0.000001. Enter a higher amount and try again.",
    });
  });

  it("blocks a sub-unit amount that toFixed would round UP to one base unit", () => {
    // 0.0000009 USDC -> toFixed(6) = "0.000001" (1 base unit). A round-to-zero
    // check would miss this and let the borrow execute for more than entered;
    // comparing against the minimum blocks all sub-unit amounts.
    const result = validateBorrowAction(0.0000009, Infinity, 10000, 6, "USDC");

    expect(result.buttonText).toBe("Amount too small");
    expect(result.errorMessage).toBe(
      "The minimum borrowable amount is 0.000001. Enter a higher amount and try again.",
    );
  });

  it("allows the smallest representable amount (1 base unit)", () => {
    // 0.000001 USDC is exactly 1 base unit at 6 decimals — not sub-unit.
    const result = validateBorrowAction(0.000001, Infinity, 10000, 6, "USDC");

    expect(result.buttonText).toBe("Borrow");
  });

  it("disables with 'Amount exceeds maximum' when borrow exceeds max", () => {
    const result = validateBorrowAction(50000, 0.16, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 10,000 USDC. Enter a lower amount and try again.",
    });
  });

  it("disables with the liquidity message when the cap is the reserve's available liquidity", () => {
    // limitedByLiquidity=true → distinct copy explaining the market is the limit.
    const result = validateBorrowAction(
      6000,
      2.0,
      5000,
      6,
      "USDC",
      false,
      true,
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds available liquidity",
      errorMessage:
        "Only 5,000 USDC is available to borrow from this market right now. Enter a lower amount and try again.",
    });
  });

  it("disables with 'Health factor too low' when HF is below minimum", () => {
    const result = validateBorrowAction(8000, 1.0, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: HF_TOO_LOW_MESSAGE,
    });
  });

  it("disables when projected health factor is exactly 0", () => {
    const result = validateBorrowAction(100, 0, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: HF_TOO_LOW_MESSAGE,
    });
  });

  it("enables borrow when amount is valid and HF is safe", () => {
    const result = validateBorrowAction(5000, 2.0, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("enables borrow when HF is Infinity (no debt)", () => {
    const result = validateBorrowAction(1000, Infinity, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("prioritizes max amount check over health factor check", () => {
    // Amount exceeds max AND HF is low — should show max amount error
    const result = validateBorrowAction(20000, 0.5, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 10,000 USDC. Enter a lower amount and try again.",
    });
  });

  it("enables borrow at exactly max amount with safe HF", () => {
    const result = validateBorrowAction(10000, 1.5, 10000, 6, "USDC");

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("disables with 'Refreshing position...' when position data is stale", () => {
    const result = validateBorrowAction(5000, 2.0, 10000, 6, "USDC", true);

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Refreshing position...",
      errorMessage: null,
    });
  });

  it("does not block when isPositionDataStale is false", () => {
    const result = validateBorrowAction(5000, 2.0, 10000, 6, "USDC", false);

    expect(result.isDisabled).toBe(false);
  });

  it("prioritizes staleness check over other validations", () => {
    // Stale AND amount is 0 — staleness should take priority
    const result = validateBorrowAction(0, Infinity, 10000, 6, "USDC", true);

    expect(result.buttonText).toBe("Refreshing position...");
  });

  it("formats the max with WBTC's precision and includes the symbol", () => {
    // 0.0000099 WBTC max — a 2-decimal format would round to "0"; sub-1 amounts
    // keep the token's native precision so the value survives.
    const result = validateBorrowAction(0.0001, 2.0, 0.0000099, 8, "WBTC");

    expect(result.buttonText).toBe("Amount exceeds maximum");
    expect(result.errorMessage).toBe(
      "The maximum borrowable amount is 0.0000099 WBTC. Enter a lower amount and try again.",
    );
  });
});
