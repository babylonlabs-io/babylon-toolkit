import { describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();
vi.mock("../../client", () => ({
  ethClient: { getPublicClient: () => ({ readContract: mockReadContract }) },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0x0000000000000000000000000000000000000001",
  },
}));

import { getDepositorVaultIdsFromChain } from "../depositorVaultIds";

const DEPOSITOR = "0x00000000000000000000000000000000000000d1";

describe("getDepositorVaultIdsFromChain", () => {
  it("reads getDepositorVaultIds from the configured registry for the depositor", async () => {
    const ids = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`];
    mockReadContract.mockResolvedValueOnce(ids);

    await expect(getDepositorVaultIdsFromChain(DEPOSITOR)).resolves.toEqual(
      ids,
    );
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0x0000000000000000000000000000000000000001",
        functionName: "getDepositorVaultIds",
        args: [DEPOSITOR],
      }),
    );
  });

  it("propagates a failed read instead of answering with no vaults", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("execution reverted"));

    await expect(getDepositorVaultIdsFromChain(DEPOSITOR)).rejects.toThrow(
      /reverted/,
    );
  });
});
