import { beforeEach, describe, expect, it, vi } from "vitest";

const multicall = vi.fn();
vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => ({ multicall }) },
}));

// aaveHub.ts also re-exports an SDK rate read; stub the SDK so the module loads
// without pulling the real package into the test.
vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  getAssetDrawnRatesSafe: vi.fn(),
}));

import { getAssetLiquiditiesSafe } from "../aaveHub";

const HUB = "0x0000000000000000000000000000000000000003" as const;

describe("getAssetLiquiditiesSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pairs liquidity + owed per asset into one result", async () => {
    multicall.mockResolvedValueOnce([
      { status: "success", result: 100n },
      { status: "success", result: 30n },
      { status: "success", result: 500n },
      { status: "success", result: 0n },
    ]);

    const out = await getAssetLiquiditiesSafe([
      { hub: HUB, assetId: 1 },
      { hub: HUB, assetId: 2 },
    ]);

    expect(out).toEqual([
      {
        hub: HUB,
        assetId: 1,
        availableLiquidityRaw: 100n,
        totalOwedRaw: 30n,
        error: null,
      },
      {
        hub: HUB,
        assetId: 2,
        availableLiquidityRaw: 500n,
        totalOwedRaw: 0n,
        error: null,
      },
    ]);
  });

  it("nulls an asset whole when either leg reverts (no half-read)", async () => {
    multicall.mockResolvedValueOnce([
      { status: "success", result: 100n },
      { status: "failure", error: new Error("owed reverted") },
    ]);

    const [result] = await getAssetLiquiditiesSafe([{ hub: HUB, assetId: 1 }]);

    expect(result.availableLiquidityRaw).toBeNull();
    expect(result.totalOwedRaw).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });

  it("marks every asset failed on a network-level multicall throw", async () => {
    multicall.mockRejectedValueOnce(new Error("RPC down"));

    const out = await getAssetLiquiditiesSafe([
      { hub: HUB, assetId: 1 },
      { hub: HUB, assetId: 2 },
    ]);

    expect(out).toHaveLength(2);
    for (const result of out) {
      expect(result.availableLiquidityRaw).toBeNull();
      expect(result.totalOwedRaw).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
    }
  });

  it("skips the multicall entirely for an empty request list", async () => {
    expect(await getAssetLiquiditiesSafe([])).toEqual([]);
    expect(multicall).not.toHaveBeenCalled();
  });
});
