import { describe, expect, it } from "vitest";

import { validateRepayAction } from "../validateRepayAction";

// Signature: (repayAmount, maxRepayAmount, currentDebtAmount?, userTokenBalance?, displayDecimals?)
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
});
