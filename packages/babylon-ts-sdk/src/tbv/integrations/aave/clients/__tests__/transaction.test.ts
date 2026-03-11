import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import AaveIntegrationControllerABI from "../abis/AaveIntegrationController.abi.json";
import {
  buildWithdrawCollateralsTx,
  buildBorrowTx,
  buildRepayTx,
} from "../transaction.js";

const CONTRACT_ADDRESS = "0x1234567890123456789012345678901234567890" as const;

describe("transaction builders", () => {
  describe("buildWithdrawCollateralsTx", () => {
    it("should encode withdrawCollaterals with vault IDs", () => {
      const vaultIds = [
        "0x0000000000000000000000000000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      ] as const;

      const result = buildWithdrawCollateralsTx(CONTRACT_ADDRESS, [...vaultIds]);

      expect(result.to).toBe(CONTRACT_ADDRESS);
      expect(result.data).toBeDefined();

      // Decode and verify the function call
      const decoded = decodeFunctionData({
        abi: AaveIntegrationControllerABI,
        data: result.data,
      });

      expect(decoded.functionName).toBe("withdrawCollaterals");
      expect(decoded.args).toHaveLength(1);
      expect(decoded.args![0]).toEqual([...vaultIds]);
    });

    it("should encode with a single vault ID", () => {
      const vaultIds = [
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      ] as const;

      const result = buildWithdrawCollateralsTx(CONTRACT_ADDRESS, [...vaultIds]);

      const decoded = decodeFunctionData({
        abi: AaveIntegrationControllerABI,
        data: result.data,
      });

      expect(decoded.functionName).toBe("withdrawCollaterals");
      expect(decoded.args![0]).toEqual([...vaultIds]);
    });
  });

  describe("buildBorrowTx", () => {
    it("should encode borrowFromCorePosition", () => {
      const receiver =
        "0x1234567890123456789012345678901234567890" as const;
      const result = buildBorrowTx(CONTRACT_ADDRESS, 2n, 1000000n, receiver);

      expect(result.to).toBe(CONTRACT_ADDRESS);

      const decoded = decodeFunctionData({
        abi: AaveIntegrationControllerABI,
        data: result.data,
      });

      expect(decoded.functionName).toBe("borrowFromCorePosition");
      expect(decoded.args).toEqual([2n, 1000000n, receiver]);
    });
  });

  describe("buildRepayTx", () => {
    it("should encode repayToCorePosition", () => {
      const borrower =
        "0x1234567890123456789012345678901234567890" as const;
      const result = buildRepayTx(CONTRACT_ADDRESS, borrower, 2n, 500000n);

      expect(result.to).toBe(CONTRACT_ADDRESS);

      const decoded = decodeFunctionData({
        abi: AaveIntegrationControllerABI,
        data: result.data,
      });

      expect(decoded.functionName).toBe("repayToCorePosition");
      expect(decoded.args).toEqual([borrower, 2n, 500000n]);
    });
  });
});
