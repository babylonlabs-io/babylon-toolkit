import { describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
    }),
  },
}));

import {
  InvalidTokenDecimalsError,
  getERC20Decimals,
  getERC20Name,
  getERC20Symbol,
} from "../query";

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

  it("throws InvalidTokenDecimalsError, not a plain Error, when decimals exceed 18", async () => {
    mockReadContract.mockResolvedValue(19);

    await expect(getERC20Decimals(TOKEN_ADDRESS)).rejects.toBeInstanceOf(
      InvalidTokenDecimalsError,
    );
  });

  it("accepts decimals equal to 18", async () => {
    mockReadContract.mockResolvedValue(18);

    const result = await getERC20Decimals(TOKEN_ADDRESS);

    expect(result).toBe(18);
  });
});

describe("getERC20Symbol", () => {
  it("returns the symbol from the contract", async () => {
    mockReadContract.mockResolvedValue("USDC");

    const result = await getERC20Symbol(TOKEN_ADDRESS);

    expect(result).toBe("USDC");
  });

  it("calls readContract with the correct address and function", async () => {
    mockReadContract.mockResolvedValue("USDC");

    await getERC20Symbol(TOKEN_ADDRESS);

    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN_ADDRESS,
        functionName: "symbol",
        args: [],
      }),
    );
  });

  it("strips zero-width joiners a hostile token could use to spoof a symbol", async () => {
    mockReadContract.mockResolvedValue("US\u200BDC");

    const result = await getERC20Symbol(TOKEN_ADDRESS);

    expect(result).toBe("USDC");
  });

  it("truncates an oversized symbol to 16 characters", async () => {
    mockReadContract.mockResolvedValue("A".repeat(500));

    const result = await getERC20Symbol(TOKEN_ADDRESS);

    expect(result).toBe("A".repeat(16));
  });

  it("returns null when the symbol is only whitespace and zero-width characters", async () => {
    mockReadContract.mockResolvedValue(" \u200B\u200B ");

    const result = await getERC20Symbol(TOKEN_ADDRESS);

    expect(result).toBeNull();
  });
});

describe("getERC20Name", () => {
  it("returns the name from the contract", async () => {
    mockReadContract.mockResolvedValue("USD Coin");

    const result = await getERC20Name(TOKEN_ADDRESS);

    expect(result).toBe("USD Coin");
  });

  it("truncates an oversized name to 64 characters", async () => {
    mockReadContract.mockResolvedValue("B".repeat(500));

    const result = await getERC20Name(TOKEN_ADDRESS);

    expect(result).toBe("B".repeat(64));
  });

  it("returns null when the name is empty after sanitizing", async () => {
    mockReadContract.mockResolvedValue("");

    const result = await getERC20Name(TOKEN_ADDRESS);

    expect(result).toBeNull();
  });
});
