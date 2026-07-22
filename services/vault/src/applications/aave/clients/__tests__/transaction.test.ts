import { encodeErrorResult } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContractError,
  ErrorCode,
  isSimulationPhaseError,
} from "@/utils/errors";

const { mockPublicClient } = vi.hoisted(() => ({
  mockPublicClient: {
    call: vi.fn(),
    getTransaction: vi.fn(),
  },
}));

vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => mockPublicClient },
}));

vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 1 }),
}));

import { repayToCorePosition } from "../transaction";

const ERC20_INSUFFICIENT_ALLOWANCE_ABI = [
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
] as const;

const walletClient = {
  chain: { id: 1 },
  account: { address: "0x2000000000000000000000000000000000000002" },
  sendTransaction: vi.fn(),
} as any;

const repayCall = () =>
  repayToCorePosition(
    walletClient,
    { id: 1 } as any,
    "0x3000000000000000000000000000000000000003",
    "0x2000000000000000000000000000000000000002",
    0n,
    3n,
  );

describe("executeTx simulation-phase tagging (via repayToCorePosition)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags a simulation allowance revert and decodes its reason — the exact shape the repay retry keys on", async () => {
    // An eth_call revert carrying the OZ-v5 custom error data, as a
    // JSON-RPC-shaped error object with the revert hex on `data`.
    const revertData = encodeErrorResult({
      abi: ERC20_INSUFFICIENT_ALLOWANCE_ABI,
      errorName: "ERC20InsufficientAllowance",
      args: ["0x3000000000000000000000000000000000000003", 2n, 3n],
    });
    mockPublicClient.call.mockRejectedValue(
      Object.assign(new Error("execution reverted"), { data: revertData }),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(true);
    expect((thrown as ContractError).code).toBe(ErrorCode.CONTRACT_REVERT);
    expect((thrown as ContractError).reason).toBe("ERC20InsufficientAllowance");
    // Nothing was signed or broadcast.
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });

  it("does not tag a post-simulation send failure", async () => {
    mockPublicClient.call.mockResolvedValue({});
    walletClient.sendTransaction.mockRejectedValue(new Error("nonce too low"));

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(false);
  });
});
