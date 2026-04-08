import { describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
    }),
  },
}));

import { getERC20Decimals } from "../query";

const TOKEN_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("getERC20Decimals", () => {
  it("returns decimals from the contract", async () => {
    mockReadContract.mockResolvedValue(6);

    const result = await getERC20Decimals(TOKEN_ADDRESS);

    expect(result).toBe(6);
  });

  it("calls readContract with the correct address and function", async () => {
    mockReadContract.mockResolvedValue(18);

    await getERC20Decimals(TOKEN_ADDRESS);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN_ADDRESS,
        functionName: "decimals",
        args: [],
      }),
    );
  });

  it("throws when decimals exceed 18", async () => {
    mockReadContract.mockResolvedValue(19);

    await expect(getERC20Decimals(TOKEN_ADDRESS)).rejects.toThrow(
      `Token ${TOKEN_ADDRESS} reported 19 decimals, expected at most 18`,
    );
  });

  it("accepts decimals equal to 18", async () => {
    mockReadContract.mockResolvedValue(18);

    const result = await getERC20Decimals(TOKEN_ADDRESS);

    expect(result).toBe(18);
  });
});
