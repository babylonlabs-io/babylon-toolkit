import { describe, expect, it } from "vitest";

import { MIN_HEALTH_FACTOR_FOR_BORROW } from "../../../../../constants";
import { validateBorrowAction } from "../validateBorrowAction";

describe("validateBorrowAction", () => {
  it("disables with 'Enter an amount' when borrow amount is 0", () => {
    const result = validateBorrowAction(0, Infinity, 10000);

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Enter an amount",
      errorMessage: null,
    });
  });

  it("disables with 'Amount exceeds maximum' when borrow exceeds max", () => {
    const result = validateBorrowAction(50000, 0.16, 10000);

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage: "Maximum borrowable amount is 10000.00",
    });
  });

  it("disables with 'Health factor too low' when HF is below minimum", () => {
    const result = validateBorrowAction(8000, 1.0, 10000);

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: `Borrowing this amount would put your health factor below ${MIN_HEALTH_FACTOR_FOR_BORROW}, risking liquidation. Reduce the borrow amount.`,
    });
  });

  it("disables when projected health factor is exactly 0", () => {
    const result = validateBorrowAction(100, 0, 10000);

    expect(result).toEqual({
      isDisabled: true,
      buttonText: "Health factor too low",
      errorMessage: `Borrowing this amount would put your health factor below ${MIN_HEALTH_FACTOR_FOR_BORROW}, risking liquidation. Reduce the borrow amount.`,
    });
  });

  it("enables borrow when amount is valid and HF is safe", () => {
    const result = validateBorrowAction(5000, 2.0, 10000);

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("enables borrow when HF is Infinity (no debt)", () => {
    const result = validateBorrowAction(1000, Infinity, 10000);

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });

  it("prioritizes max amount check over health factor check", () => {
    // Amount exceeds max AND HF is low — should show max amount error
    const result = validateBorrowAction(20000, 0.5, 10000);

    expect(result.buttonText).toBe("Amount exceeds maximum");
  });

  it("enables borrow at exactly max amount with safe HF", () => {
    const result = validateBorrowAction(10000, 1.5, 10000);

    expect(result).toEqual({
      isDisabled: false,
      buttonText: "Borrow",
      errorMessage: null,
    });
  });
});
