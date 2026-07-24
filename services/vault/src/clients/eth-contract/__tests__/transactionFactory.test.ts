import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContractError, isSimulationPhaseError } from "@/utils/errors";

const { mockPublicClient, mockWaitReceipt } = vi.hoisted(() => ({
  mockPublicClient: {
    simulateContract: vi.fn(),
    call: vi.fn(),
    getTransaction: vi.fn(),
  },
  mockWaitReceipt: vi.fn(),
}));

vi.mock("../client", () => ({
  ethClient: { getPublicClient: () => mockPublicClient },
}));

vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 1 }),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), event: vi.fn() },
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  waitForTransactionReceiptSmartAware: (...args: unknown[]) =>
    mockWaitReceipt(...args),
}));

import { executeWrite } from "../transactionFactory";

const APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const walletClient = {
  chain: { id: 1 },
  account: { address: "0x2000000000000000000000000000000000000002" },
  writeContract: vi.fn(),
} as any;

const write = () =>
  executeWrite({
    walletClient,
    chain: { id: 1 } as any,
    address: "0x1000000000000000000000000000000000000001",
    abi: APPROVE_ABI,
    functionName: "approve",
    args: ["0x3000000000000000000000000000000000000003", 1n],
    errorContext: "approve ERC20",
  });

describe("executeWrite simulation-phase tagging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags a pre-flight simulation failure as simulation-phase", async () => {
    mockPublicClient.simulateContract.mockRejectedValue(
      new Error("execution reverted"),
    );

    const thrown = await write().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(true);
    // Nothing was signed or broadcast.
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("does not tag a post-simulation send failure", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockRejectedValue(new Error("nonce too low"));

    const thrown = await write().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(false);
  });

  it("does not tag a mined revert surfaced via receipt replay", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xhash");
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      gasUsed: 10n,
      blockNumber: 5n,
      transactionHash: "0xabc",
      logs: [],
    });
    mockPublicClient.getTransaction.mockResolvedValue({ gas: 1000n });
    // The replay call rethrows the on-chain revert for decoding.
    mockPublicClient.call.mockRejectedValue(new Error("execution reverted"));

    const thrown = await write().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(false);
  });
});
