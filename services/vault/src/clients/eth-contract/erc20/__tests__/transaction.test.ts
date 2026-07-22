import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractError, ErrorCode } from "@/utils/errors";

const mockExecuteWrite = vi.fn();

vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

import { approveERC20 } from "../transaction";

const TOKEN_ADDRESS = "0xTokenAddress" as `0x${string}`;
const SPENDER_ADDRESS = "0xSpenderAddress" as `0x${string}`;

const mockWalletClient = {
  account: { address: "0xOwnerAddress" },
} as Parameters<typeof approveERC20>[0];

const mockChain = { id: 1, name: "Ethereum" } as Parameters<
  typeof approveERC20
>[1];

const txResult = { transactionHash: "0xhash", receipt: {} };

/** The shape executeWrite throws for a USDT-style non-zero→non-zero revert. */
const approveRevert = () =>
  new ContractError("approve reverted", ErrorCode.CONTRACT_REVERT);

describe("approveERC20", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a single approve for a standard token — no zero-reset", async () => {
    mockExecuteWrite.mockResolvedValue(txResult);

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

  it("falls back to reset-then-approve when the direct approve reverts", async () => {
    mockExecuteWrite
      .mockRejectedValueOnce(approveRevert())
      .mockResolvedValue(txResult);

    await approveERC20(
      mockWalletClient,
      mockChain,
      TOKEN_ADDRESS,
      SPENDER_ADDRESS,
      1000n,
    );

    expect(mockExecuteWrite).toHaveBeenCalledTimes(3);
    expect(mockExecuteWrite).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 0n],
        errorContext: "reset ERC20 approval to zero",
      }),
    );
    expect(mockExecuteWrite).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 1000n],
        errorContext: "approve ERC20",
      }),
    );
  });

  it("rethrows a user rejection without attempting the zero-reset", async () => {
    // EIP-1193 user rejection surfaced through the mapped error's cause chain.
    const rejection = new ContractError(
      "approve failed",
      ErrorCode.CONTRACT_REVERT,
      undefined,
      undefined,
      { cause: { code: 4001, message: "User rejected the request." } },
    );
    mockExecuteWrite.mockRejectedValue(rejection);

    await expect(
      approveERC20(
        mockWalletClient,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("approve failed");

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-revert failures (e.g. network) without attempting the zero-reset", async () => {
    mockExecuteWrite.mockRejectedValue(
      new ContractError("rpc timeout", ErrorCode.CONTRACT_EXECUTION_FAILED),
    );

    await expect(
      approveERC20(
        mockWalletClient,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("rpc timeout");

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
  });
});
