import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractError, ErrorCode, tagSimulationPhase } from "@/utils/errors";

const mockExecuteWrite = vi.fn();

vi.mock("@/clients/eth-contract/transactionFactory", () => ({
  executeWrite: (...args: unknown[]) => mockExecuteWrite(...args),
}));

const mockGetERC20Allowance = vi.fn();

vi.mock("@/clients/eth-contract/erc20/query", () => ({
  getERC20Allowance: (...args: unknown[]) => mockGetERC20Allowance(...args),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), event: vi.fn() },
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

const txResult = { transactionHash: "0xhash", receipt: {} };

/** The shape executeWrite throws for a USDT-style pre-broadcast revert. */
const simulationRevert = () =>
  tagSimulationPhase(
    new ContractError("approve reverted", ErrorCode.CONTRACT_REVERT),
  );

describe("approveERC20", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetERC20Allowance.mockResolvedValue(500n);
  });

  it("sends a single approve for a standard token — no zero-reset, no allowance read", async () => {
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
    expect(mockGetERC20Allowance).not.toHaveBeenCalled();
  });

  it("falls back to reset-then-approve on a simulation revert with a non-zero allowance", async () => {
    mockExecuteWrite
      .mockRejectedValueOnce(simulationRevert())
      .mockResolvedValue(txResult);

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
    expect(mockExecuteWrite).toHaveBeenCalledTimes(3);
    expect(mockExecuteWrite).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        args: [SPENDER_ADDRESS, 1000n],
        errorContext: "approve ERC20",
      }),
    );
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

  it("rethrows a simulation revert without the fallback when the allowance is zero", async () => {
    // The zero-first quirk needs a non-zero allowance; this revert has some
    // other cause and the reset could clear nothing but still prompt.
    mockGetERC20Allowance.mockResolvedValue(0n);
    mockExecuteWrite.mockRejectedValue(simulationRevert());

    await expect(
      approveERC20(
        mockWalletClient,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("approve reverted");

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
  });

  it("rethrows a mined (untagged) revert without the fallback", async () => {
    // The tx was broadcast and reverted on-chain — gas was burned; auto-firing
    // a reset prompt on top would surprise the user.
    mockExecuteWrite.mockRejectedValue(
      new ContractError("approve reverted", ErrorCode.CONTRACT_REVERT),
    );

    await expect(
      approveERC20(
        mockWalletClient,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("approve reverted");

    expect(mockExecuteWrite).toHaveBeenCalledTimes(1);
    expect(mockGetERC20Allowance).not.toHaveBeenCalled();
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

  it("surfaces a failure of the fallback's reset step", async () => {
    mockExecuteWrite
      .mockRejectedValueOnce(simulationRevert())
      .mockRejectedValueOnce(
        new ContractError("reset reverted", ErrorCode.CONTRACT_REVERT),
      );

    await expect(
      approveERC20(
        mockWalletClient,
        mockChain,
        TOKEN_ADDRESS,
        SPENDER_ADDRESS,
        1000n,
      ),
    ).rejects.toThrow("reset reverted");

    expect(mockExecuteWrite).toHaveBeenCalledTimes(2);
  });
});
