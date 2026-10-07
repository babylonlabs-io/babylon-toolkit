import { describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();
vi.mock("../../client", () => ({
  ethClient: { getPublicClient: () => ({ readContract: mockReadContract }) },
}));

import { readAllowedToDeposit } from "../query";

const ENTRY_POINT = "0x00000000000000000000000000000000000000a1";
const RECEIVER = "0x00000000000000000000000000000000000000b2";

describe("readAllowedToDeposit", () => {
  it("asks the given entry point with receiver, vault count and amount in ABI order", async () => {
    mockReadContract.mockResolvedValueOnce(true);

    await readAllowedToDeposit({
      applicationEntryPoint: ENTRY_POINT,
      vaultReceiver: RECEIVER,
      nVaultsToDeposit: 2n,
      amountToDeposit: 150_000n,
    });

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ENTRY_POINT,
        functionName: "allowedToDeposit",
        args: [RECEIVER, 2n, 150_000n],
      }),
    );
  });

  it("returns the application's refusal as false", async () => {
    mockReadContract.mockResolvedValueOnce(false);

    await expect(
      readAllowedToDeposit({
        applicationEntryPoint: ENTRY_POINT,
        vaultReceiver: RECEIVER,
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    ).resolves.toBe(false);
  });

  it("propagates a failed read instead of answering", async () => {
    mockReadContract.mockRejectedValueOnce(new Error("execution reverted"));

    await expect(
      readAllowedToDeposit({
        applicationEntryPoint: ENTRY_POINT,
        vaultReceiver: RECEIVER,
        nVaultsToDeposit: 1n,
        amountToDeposit: 100_000n,
      }),
    ).rejects.toThrow(/reverted/);
  });
});
