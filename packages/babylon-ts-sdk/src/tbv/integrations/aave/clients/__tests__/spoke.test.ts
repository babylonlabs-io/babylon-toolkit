import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  getDynamicReserveConfig,
  getReserve,
  getTargetHealthFactor,
} from "../spoke.js";

const STUB_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;
const STUB_RESERVE_ID = 1n;
const STUB_DYNAMIC_CONFIG_KEY = 0;

function createMockClient(
  returnValue: unknown,
): PublicClient {
  return {
    readContract: vi.fn().mockResolvedValue(returnValue),
  } as unknown as PublicClient;
}

describe("Core Spoke parameter reads", () => {
  describe("getTargetHealthFactor", () => {
    it("reads targetHealthFactor from getLiquidationConfig", async () => {
      const expectedTHF = 1_100_000_000_000_000_000n;
      const client = createMockClient({
        targetHealthFactor: expectedTHF,
        healthFactorForMaxBonus: 900_000_000_000_000_000n,
        liquidationBonusFactor: 5000n,
      });

      const thf = await getTargetHealthFactor(client, STUB_ADDRESS);

      expect(thf).toBe(expectedTHF);
      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: STUB_ADDRESS,
          functionName: "getLiquidationConfig",
        }),
      );
    });
  });

  describe("getDynamicReserveConfig", () => {
    it("reads dynamic reserve config with reserveId and dynamicConfigKey", async () => {
      const expectedConfig = {
        collateralFactor: 7500n,
        maxLiquidationBonus: 10500n,
        liquidationFee: 100n,
      };
      const client = createMockClient(expectedConfig);

      const config = await getDynamicReserveConfig(
        client,
        STUB_ADDRESS,
        STUB_RESERVE_ID,
        STUB_DYNAMIC_CONFIG_KEY,
      );

      expect(config).toEqual(expectedConfig);
      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: STUB_ADDRESS,
          functionName: "getDynamicReserveConfig",
          args: [STUB_RESERVE_ID, STUB_DYNAMIC_CONFIG_KEY],
        }),
      );
    });
  });

  describe("getReserve", () => {
    it("reads reserve data with reserveId via the getReserve selector", async () => {
      const expectedReserve = {
        underlying: STUB_ADDRESS,
        hub: STUB_ADDRESS,
        assetId: 1,
        decimals: 8,
        collateralRisk: 1000,
        flags: 0,
        dynamicConfigKey: 3,
      };
      const client = createMockClient(expectedReserve);

      const reserve = await getReserve(
        client,
        STUB_ADDRESS,
        STUB_RESERVE_ID,
      );

      expect(reserve).toEqual(expectedReserve);
      expect(client.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: STUB_ADDRESS,
          functionName: "getReserve",
          args: [STUB_RESERVE_ID],
        }),
      );
    });
  });
});
