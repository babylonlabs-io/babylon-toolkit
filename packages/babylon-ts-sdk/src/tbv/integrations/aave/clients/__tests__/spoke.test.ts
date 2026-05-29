import type { Address, PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  getDynamicReserveConfig,
  getReserve,
  getTargetHealthFactor,
  getUserPositions,
  getUserTotalDebts,
} from "../spoke.js";

const STUB_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;
const STUB_RESERVE_ID = 1n;
const STUB_DYNAMIC_CONFIG_KEY = 0;

const USER = "0x2222222222222222222222222222222222222222" as Address;
const POSITION = {
  drawnShares: 10n,
  premiumShares: 1n,
  premiumOffsetRay: 0n,
  suppliedShares: 0n,
  dynamicConfigKey: 0,
};

function createMockClient(
  returnValue: unknown,
): PublicClient {
  return {
    readContract: vi.fn().mockResolvedValue(returnValue),
  } as unknown as PublicClient;
}

function createMulticallClient(
  multicall: ReturnType<typeof vi.fn>,
): PublicClient {
  return { multicall } as unknown as PublicClient;
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

describe("getUserPositions (batched probe)", () => {
  it("returns [] and skips the multicall when given no reserve IDs", async () => {
    const multicall = vi.fn();
    const result = await getUserPositions(
      createMulticallClient(multicall),
      STUB_ADDRESS,
      [],
      USER,
    );
    expect(result).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });

  it("issues one getUserPosition call per reserve with per-reserve soft-fail (allowFailure: true)", async () => {
    const multicall = vi.fn().mockResolvedValue([
      { status: "success", result: POSITION },
      { status: "success", result: POSITION },
    ]);

    const result = await getUserPositions(
      createMulticallClient(multicall),
      STUB_ADDRESS,
      [1n, 2n],
      USER,
    );

    expect(result).toEqual([POSITION, POSITION]);
    expect(multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFailure: true,
        contracts: [
          expect.objectContaining({
            address: STUB_ADDRESS,
            functionName: "getUserPosition",
            args: [1n, USER],
          }),
          expect.objectContaining({
            address: STUB_ADDRESS,
            functionName: "getUserPosition",
            args: [2n, USER],
          }),
        ],
      }),
    );
  });

  it("maps a per-reserve revert to null while keeping successful entries in input order", async () => {
    const multicall = vi.fn().mockResolvedValue([
      { status: "success", result: POSITION },
      { status: "failure", error: new Error("InvalidReserve(2)") },
      { status: "success", result: POSITION },
    ]);

    const result = await getUserPositions(
      createMulticallClient(multicall),
      STUB_ADDRESS,
      [1n, 2n, 3n],
      USER,
    );

    expect(result).toEqual([POSITION, null, POSITION]);
  });
});

describe("getUserTotalDebts (batched readout)", () => {
  it("returns [] and skips the multicall when given no reserve IDs", async () => {
    const multicall = vi.fn();
    const result = await getUserTotalDebts(
      createMulticallClient(multicall),
      STUB_ADDRESS,
      [],
      USER,
    );
    expect(result).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });

  it("issues one getUserTotalDebt call per reserve and hard-fails (allowFailure: false), returning debts in input order", async () => {
    const multicall = vi.fn().mockResolvedValue([100n, 200n]);

    const result = await getUserTotalDebts(
      createMulticallClient(multicall),
      STUB_ADDRESS,
      [1n, 2n],
      USER,
    );

    expect(result).toEqual([100n, 200n]);
    expect(multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFailure: false,
        contracts: [
          expect.objectContaining({
            address: STUB_ADDRESS,
            functionName: "getUserTotalDebt",
            args: [1n, USER],
          }),
          expect.objectContaining({
            address: STUB_ADDRESS,
            functionName: "getUserTotalDebt",
            args: [2n, USER],
          }),
        ],
      }),
    );
  });

  it("propagates a multicall rejection (hard-fail; no silent 0n fallback)", async () => {
    const multicall = vi.fn().mockRejectedValue(new Error("RPC reverted"));
    await expect(
      getUserTotalDebts(createMulticallClient(multicall), STUB_ADDRESS, [1n], USER),
    ).rejects.toThrow("RPC reverted");
  });
});
