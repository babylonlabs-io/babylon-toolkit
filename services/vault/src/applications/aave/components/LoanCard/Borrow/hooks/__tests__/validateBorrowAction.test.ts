import { describe, expect, it } from "vitest";

import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../../constants";
import { getBorrowLimit, validateBorrowAction } from "../validateBorrowAction";

const HF_TOO_LOW_MESSAGE = `Borrowing this amount would drop your health factor below ${MIN_HEALTH_FACTOR_FOR_BORROW}, risking liquidation. Reduce the amount and try again.`;

describe("validateBorrowAction", () => {
  it("disables with 'Enter an amount' when borrow amount is 0", () => {
    const result = validateBorrowAction(
      0,
      Infinity,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

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
      "Core Hub",
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
    const result = validateBorrowAction(
      0.0000009,
      Infinity,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result.buttonText).toBe("Amount too small");
    expect(result.errorMessage).toBe(
      "The minimum borrowable amount is 0.000001. Enter a higher amount and try again.",
    );
  });

  it("allows the smallest representable amount (1 base unit)", () => {
    // 0.000001 USDC is exactly 1 base unit at 6 decimals — not sub-unit.
    const result = validateBorrowAction(
      0.000001,
      Infinity,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result.buttonText).toBe("Borrow");
  });

  it("disables with 'Amount exceeds maximum' when borrow exceeds max", () => {
    const result = validateBorrowAction(
      50000,
      0.16,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 10,000 USDC on Core Hub. Enter a lower amount and try again.",
    });
  });

  it("disables with the liquidity message when the cap is the reserve's available liquidity", () => {
    // limitedBy="liquidity" → distinct copy explaining the market is the limit.
    const result = validateBorrowAction(
      6000,
      2.0,
      5000,
      6,
      "USDC",
      "Core Hub",
      false,
      "liquidity",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds available liquidity",
      errorMessage:
        "Only 5,000 USDC on Core Hub is available to borrow right now. Enter a lower amount and try again.",
    });
  });

  it("disables with the borrow-limit message when the cap is the hub's borrow limit", () => {
    const result = validateBorrowAction(
      6000,
      2.0,
      5000,
      6,
      "USDC",
      "Core Hub",
      false,
      "borrowLimit",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds borrow limit",
      errorMessage:
        "Only 5,000 USDC on Core Hub is left under this market's borrow limit. Enter a lower amount and try again.",
    });
  });

  it("keeps the collateral max when neither cap is known", () => {
    expect(getBorrowLimit(100, Infinity, Infinity)).toEqual({
      max: 100,
      limitedBy: "collateral",
    });
  });

  it("caps at liquidity when the hub holds less than collateral allows", () => {
    expect(getBorrowLimit(100, 50, Infinity)).toEqual({
      max: 50,
      limitedBy: "liquidity",
    });
  });

  it("caps at the borrow limit when it leaves less than liquidity", () => {
    expect(getBorrowLimit(100, 50, 40)).toEqual({
      max: 40,
      limitedBy: "borrowLimit",
    });
  });

  it("caps at zero when the borrow limit is used up", () => {
    expect(getBorrowLimit(100, 50, 0)).toEqual({
      max: 0,
      limitedBy: "borrowLimit",
    });
  });

  it("names the borrow limit when it ties with liquidity, since the hub checks it first", () => {
    expect(getBorrowLimit(100, 50, 50).limitedBy).toBe("borrowLimit");
  });

  it("names collateral when a cap only equals the collateral max", () => {
    expect(getBorrowLimit(50, 50, 50).limitedBy).toBe("collateral");
  });

  it("says the borrow limit is reached when it leaves nothing to borrow", () => {
    const result = validateBorrowAction(
      10,
      2.0,
      0,
      6,
      "USDC",
      "Core Hub",
      false,
      "borrowLimit",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds borrow limit",
      errorMessage:
        "USDC on Core Hub has reached its borrow limit. Try again later or borrow from another hub.",
    });
  });

  it("disables with 'Health factor too low' when HF is below minimum", () => {
    const result = validateBorrowAction(
      8000,
      1.0,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: HF_TOO_LOW_MESSAGE,
    });
  });

  it("disables when projected health factor is exactly 0", () => {
    const result = validateBorrowAction(100, 0, 10000, 6, "USDC", "Core Hub");

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: HF_TOO_LOW_MESSAGE,
    });
  });

  it("enables borrow when amount is valid and HF is safe", () => {
    const result = validateBorrowAction(
      5000,
      2.0,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("enables borrow when HF is Infinity (no debt)", () => {
    const result = validateBorrowAction(
      1000,
      Infinity,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("prioritizes max amount check over health factor check", () => {
    // Amount exceeds max AND HF is low — should show max amount error
    const result = validateBorrowAction(
      20000,
      0.5,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 10,000 USDC on Core Hub. Enter a lower amount and try again.",
    });
  });

  it("enables borrow at exactly max amount with safe HF", () => {
    const result = validateBorrowAction(
      10000,
      1.5,
      10000,
      6,
      "USDC",
      "Core Hub",
    );

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("disables with 'Refreshing position...' when position data is stale", () => {
    const result = validateBorrowAction(
      5000,
      2.0,
      10000,
      6,
      "USDC",
      "Core Hub",
      true,
    );

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Refreshing position...",
      errorMessage: null,
    });
  });

  it("does not block when isPositionDataStale is false", () => {
    const result = validateBorrowAction(
      5000,
      2.0,
      10000,
      6,
      "USDC",
      "Core Hub",
      false,
    );

    expect(result.isDisabled).toBe(false);
  });

  it("prioritizes staleness check over other validations", () => {
    // Stale AND amount is 0 — staleness should take priority
    const result = validateBorrowAction(
      0,
      Infinity,
      10000,
      6,
      "USDC",
      "Core Hub",
      true,
    );

    expect(result.buttonText).toBe("Refreshing position...");
  });

  it("formats the max with WBTC's precision and names the token and its hub", () => {
    // 0.0000099 WBTC max — a 2-decimal format would round to "0"; sub-1 amounts
    // keep the token's native precision so the value survives.
    const result = validateBorrowAction(
      0.0001,
      2.0,
      0.0000099,
      8,
      "WBTC",
      "Core Hub",
    );

    expect(result.buttonText).toBe("Amount exceeds maximum");
    expect(result.errorMessage).toBe(
      "The maximum borrowable amount is 0.0000099 WBTC on Core Hub. Enter a lower amount and try again.",
    );
  });
});
