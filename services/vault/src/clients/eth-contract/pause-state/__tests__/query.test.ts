import { describe, expect, it, vi } from "vitest";

const mockMulticall = vi.fn();
vi.mock("../../client", () => ({
  ethClient: { getPublicClient: () => ({ multicall: mockMulticall }) },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x0000000000000000000000000000000000000001",
    AAVE_ADAPTER: "0x0000000000000000000000000000000000000002",
  },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/integrations/aave", () => ({
  AaveIntegrationAdapterABI: [],
}));

import { getOnChainPauseState } from "../query";

describe("getOnChainPauseState — PauseState enum mapping", () => {
  it("maps 0 / 1 / 2 to null / frozen / paused, per scope (protocol, aave)", async () => {
    mockMulticall.mockResolvedValueOnce([0, 0]);
    await expect(getOnChainPauseState()).resolves.toEqual({
      protocol: null,
      aave: null,
    });

    mockMulticall.mockResolvedValueOnce([1, 2]);
    await expect(getOnChainPauseState()).resolves.toEqual({
      protocol: "frozen",
      aave: "paused",
    });

    mockMulticall.mockResolvedValueOnce([2, 1]);
    await expect(getOnChainPauseState()).resolves.toEqual({
      protocol: "paused",
      aave: "frozen",
    });
  });

  it("throws on an unrecognized enum value instead of defaulting to unpaused", async () => {
    mockMulticall.mockResolvedValueOnce([3, 0]);
    await expect(getOnChainPauseState()).rejects.toThrow(
      /Unknown ITBVPausable\.PauseState value: 3/,
    );
  });
});
