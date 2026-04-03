import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetERC20Allowance = vi.fn();

vi.mock("@/clients/eth-contract/erc20/query", () => ({
  getERC20Allowance: (...args: unknown[]) => mockGetERC20Allowance(...args),
}));

const mockExecuteWrite = vi.fn();

vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

import { approveERC20 } from "../transaction";

const TOKEN_ADDRESS = "0xTokenAddress" as `0x${string}`;
const SPENDER_ADDRESS = "0xSpenderAddress" as `0x${string}`;
const OWNER_ADDRESS = "0xOwnerAddress" as `0x${string}`;

const mockWalletClient = {
  account: { address: OWNER_ADDRESS },
} as Parameters<typeof approveERC20>[0];

const mockChain = { id: 1, name: "Ethereum" } as Parameters<
  typeof approveERC20
>[1];

describe("approveERC20", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approves directly when current allowance is zero", async () => {
    mockGetERC20Allowance.mockResolvedValue(0n);
    mockExecuteWrite.mockResolvedValue({
      transactionHash: "0xhash",
      receipt: {},
    });

    await approveERC20(
      mockWalletClient,
      mockChain,
      TOKEN_ADDRESS,
      SPENDER_ADDRESS,
      1000n,
    );

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
    expect(mockExecuteWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 1000n],
        errorContext: "approve ERC20",
      }),
    );
  });

  it("resets allowance to zero before approving when current allowance is non-zero", async () => {
    mockGetERC20Allowance.mockResolvedValue(500n);
    mockExecuteWrite.mockResolvedValue({
      transactionHash: "0xhash",
      receipt: {},
    });

    await approveERC20(
      mockWalletClient,
      mockChain,
      TOKEN_ADDRESS,
      SPENDER_ADDRESS,
      1000n,
    );

    expect(mockExecuteWrite).toHaveBeenCalledTimes(2);
    expect(mockExecuteWrite).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 0n],
        errorContext: "reset ERC20 approval to zero",
      }),
    );
    expect(mockExecuteWrite).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 1000n],
        errorContext: "approve ERC20",
      }),
    );
  });

  it("throws when wallet account is not available", async () => {
    const noAccountWallet = { account: undefined } as Parameters<
      typeof approveERC20
    >[0];

    await expect(
      approveERC20(
        noAccountWallet,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("Wallet account not available for ERC20 approval");
  });

  it("reads allowance for the correct owner, token, and spender", async () => {
    mockGetERC20Allowance.mockResolvedValue(0n);
    mockExecuteWrite.mockResolvedValue({
      transactionHash: "0xhash",
      receipt: {},
    });

    await approveERC20(
      mockWalletClient,
      mockChain,
      TOKEN_ADDRESS,
      SPENDER_ADDRESS,
      1000n,
    );

    expect(mockGetERC20Allowance).toHaveBeenCalledWith(
      TOKEN_ADDRESS,
      OWNER_ADDRESS,
      SPENDER_ADDRESS,
    );
  });
});
