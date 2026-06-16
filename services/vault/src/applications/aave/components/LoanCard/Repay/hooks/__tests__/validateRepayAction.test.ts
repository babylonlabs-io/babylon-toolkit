import { describe, expect, it } from "vitest";

import { validateRepayAction } from "../validateRepayAction";

// Signature: (repayAmount, maxRepayAmount, currentDebtAmount?, userTokenBalance?, displayDecimals?, symbol?)
describe("validateRepayAction", () => {
  describe("sub-unit guard", () => {
    it("blocks an amount below one base unit with 'Amount too small'", () => {
      // 1e-9 WBTC is below the 8-decimal base unit (1e-8); the submit path's
      // toFixed(8) would round it to 0n and the tx would revert.
      const result = validateRepayAction(0.000000001, 1, 1, 1, 8);

      expect(result.isDisabled).toBe(true);
      expect(result.buttonText).toBe("Amount too small");
      expect(result.errorMessage).toBe(
        "Minimum repayable amount is 0.00000001",
      );
    });

    it("allows a dust debt at or above one base unit", () => {
      // 0.00000003 WBTC = 3 base units — repayable.
      const result = validateRepayAction(
        0.00000003,
        0.00000003,
        0.00000003,
        1,
        8,
      );

      expect(result.isDisabled).toBe(false);
      expect(result.buttonText).toBe("Repay");
    });

    it("does not apply the guard when displayDecimals is omitted", () => {
      const result = validateRepayAction(0.0000001, 1, 1, 1);

      expect(result.buttonText).toBe("Repay");
    });
  });

  describe("messages format at the token's precision", () => {
    it("shows dust shortfall amounts in full, not '0.00'", () => {
      // debt 5e-8, balance 3e-8 (balance < debt -> shortfall), 8-decimal token.
      const result = validateRepayAction(0, 1, 0.00000005, 0.00000003, 8);

      expect(result.buttonText).toBe("Enter an amount");
      expect(result.warningMessage).toContain("0.00000003"); // balance
      expect(result.warningMessage).toContain("0.00000005"); // debt
      expect(result.warningMessage).not.toContain("0.00 ");
    });
  });

  describe("existing behavior", () => {
    it("prompts for an amount at zero", () => {
      const result = validateRepayAction(0, 10, 10, 20, 6);
      expect(result.buttonText).toBe("Enter an amount");
    });

    it("blocks an amount above the debt", () => {
      const result = validateRepayAction(15, 10, 10, 20, 6);
      expect(result.buttonText).toBe("Amount exceeds debt");
    });

    it("blocks above a known balance shortfall with insufficient balance", () => {
      const result = validateRepayAction(5, 4, 10, 4, 6);
      expect(result.buttonText).toBe("Insufficient balance");
      expect(result.errorMessage).toContain("You only have");
    });

    it("enables a valid partial repay", () => {
      const result = validateRepayAction(5, 10, 10, 20, 6);
      expect(result.isDisabled).toBe(false);
      expect(result.buttonText).toBe("Repay");
    });
  });

  describe("zero balance with outstanding debt", () => {
    it("names the token and the amount to acquire when balance is 0 but debt remains", () => {
      // dust debt 3e-8, balance 0 -> maxRepayAmount 0; nothing to repay with.
      const result = validateRepayAction(0, 0, 0.00000003, 0, 8, "WBTC");

      expect(result.isDisabled).toBe(true);
      expect(result.buttonText).toBe("Insufficient balance");
      expect(result.errorMessage).toBe(
        "Your WBTC balance is 0. Acquire at least 0.00000003 WBTC to repay your debt.",
      );
    });

    it("shows the zero-balance message, not 'Amount exceeds debt', for a dragged cosmetic-slider value", () => {
      // With balance 0 the slider falls back to a cosmetic max; a dragged value
      // must not produce the misleading "Amount exceeds debt".
      const result = validateRepayAction(
        0.0000999,
        0,
        0.00000003,
        0,
        8,
        "WBTC",
      );

      expect(result.isDisabled).toBe(true);
      expect(result.buttonText).toBe("Insufficient balance");
      expect(result.errorMessage).toContain("WBTC");
      expect(result.errorMessage).not.toContain("cannot repay more than");
    });

    it("falls back to 'tokens' when no symbol is supplied", () => {
      const result = validateRepayAction(0, 0, 0.00000003, 0, 8);
      expect(result.errorMessage).toBe(
        "Your balance is 0. Acquire at least 0.00000003 tokens to repay your debt.",
      );
    });

    it("does not fire when there is no debt (nothing to repay)", () => {
      const result = validateRepayAction(0, 0, 0, 0, 8);
      expect(result.buttonText).toBe("Enter an amount");
    });
  });

  describe("balance below debt (dust partial repay)", () => {
    // balance 2 base units (0.00000002) < debt 3 base units (0.00000003).
    // maxRepayAmount = min(debt, balance) = balance = 0.00000002.
    it("allows repaying the full (dust) balance and warns about the residual", () => {
      const result = validateRepayAction(
        0.00000002,
        0.00000002,
        0.00000003,
        0.00000002,
        8,
        "WBTC",
      );

      expect(result.isDisabled).toBe(false);
      expect(result.buttonText).toBe("Repay");
      expect(result.warningMessage).toContain("0.00000002"); // balance
      expect(result.warningMessage).toContain("0.00000003"); // debt
      expect(result.warningMessage).toContain("0.00000001"); // residual left
      expect(result.warningMessage).toContain("WBTC");
    });

    it("blocks sliding below one base unit with 'Amount too small'", () => {
      // 5e-9 is below the 8-decimal base unit (1e-8).
      const result = validateRepayAction(
        0.000000005,
        0.00000002,
        0.00000003,
        0.00000002,
        8,
        "WBTC",
      );
      expect(result.isDisabled).toBe(true);
      expect(result.buttonText).toBe("Amount too small");
    });
  });
});
