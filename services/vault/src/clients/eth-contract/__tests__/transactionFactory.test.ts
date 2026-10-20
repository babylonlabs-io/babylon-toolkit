import { encodeFunctionData } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { logger } from "@/infrastructure";
import {
  ContractError,
  SendOutcomeUnknownError,
  isMinedRevertError,
  isSimulationPhaseError,
} from "@/utils/errors";

const {
  mockPublicClient,
  mockWaitReceipt,
  mockSendWithStaleNonceRetry,
  mockWaitForWalletToCountTransaction,
} = vi.hoisted(() => ({
  mockPublicClient: {
    simulateContract: vi.fn(),
    call: vi.fn(),
    getTransaction: vi.fn(),
  },
  mockWaitReceipt: vi.fn(),
  mockSendWithStaleNonceRetry: vi.fn(),
  mockWaitForWalletToCountTransaction: vi.fn(),
}));

vi.mock("../client", () => ({
  ethClient: { getPublicClient: () => mockPublicClient },
}));

vi.mock("../walletNonce", () => ({
  sendWithStaleNonceRetry: (...args: unknown[]) =>
    mockSendWithStaleNonceRetry(...args),
  waitForWalletToCountTransaction: (...args: unknown[]) =>
    mockWaitForWalletToCountTransaction(...args),
}));

vi.mock("@/config/network", () => ({
  configureBabylonConfig: vi.fn(),
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

const write = (
  options: {
    safePollTimeoutMs?: number;
    gas?: bigint;
    preflight?: () => Promise<void>;
  } = {},
) =>
  executeWrite({
    walletClient,
    chain: { id: 1 } as any,
    address: "0x1000000000000000000000000000000000000001",
    abi: APPROVE_ABI,
    functionName: "approve",
    args: ["0x3000000000000000000000000000000000000003", 1n],
    errorContext: "approve ERC20",
    ...options,
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockSendWithStaleNonceRetry.mockImplementation(
    ({
      send,
      walletClient,
    }: {
      send: (submissionClient: unknown) => Promise<unknown>;
      walletClient: unknown;
    }) => send(walletClient),
  );
  mockWaitForWalletToCountTransaction.mockResolvedValue(undefined);
});

describe("executeWrite simulation-phase tagging", () => {
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
    walletClient.writeContract.mockRejectedValue(
      new Error("replacement transaction underpriced"),
    );

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
    mockPublicClient.getTransaction.mockResolvedValue({
      gas: 1000n,
      to: "0x1000000000000000000000000000000000000001",
      input: "0xcef6d209",
      from: "0x2000000000000000000000000000000000000002",
    });
    // The replay call rethrows the on-chain revert for decoding.
    mockPublicClient.call.mockRejectedValue(new Error("execution reverted"));

    const thrown = await write().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(false);
    expect(isMinedRevertError(thrown)).toBe(true);
  });

  it("waits for the wallet to count a reverted transaction before surfacing the revert", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xhash");
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      gasUsed: 10n,
      blockNumber: 5n,
      transactionHash: "0xabc",
      logs: [],
    });
    mockPublicClient.getTransaction.mockResolvedValue({
      gas: 1000n,
      to: "0x1000000000000000000000000000000000000001",
      input: "0xcef6d209",
      from: "0x2000000000000000000000000000000000000002",
    });
    mockPublicClient.call.mockRejectedValue(new Error("execution reverted"));

    await write().catch(() => undefined);

    expect(mockWaitForWalletToCountTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receipt: expect.objectContaining({ transactionHash: "0xabc" }),
      }),
    );
  });
});

describe("executeWrite mined revert replay", () => {
  const REGISTRY = "0x1000000000000000000000000000000000000001";
  const SENDER = "0x2000000000000000000000000000000000000002";
  const MINED_GAS = 1_181_585n;
  const MINED_TO = "0xdb9B000000000000000000000000000000000001";
  const MINED_INPUT = "0xcef6d209";
  const MINED_FROM = "0x23fC000000000000000000000000000000000002";
  const ACCESS_LIST = [
    {
      address: "0x4000000000000000000000000000000000000004",
      storageKeys: [],
    },
  ];

  beforeEach(() => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xhash");
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      gasUsed: 10n,
      blockNumber: 5n,
      transactionHash: "0xabc",
      logs: [],
    });
    mockPublicClient.getTransaction.mockResolvedValue({
      gas: MINED_GAS,
      to: MINED_TO,
      input: MINED_INPUT,
      from: MINED_FROM,
      value: 0n,
      accessList: ACCESS_LIST,
    });
  });

  it("replays the intended call at the mined gas limit first", async () => {
    const innerReplayRevert = new Error("execution reverted");
    mockPublicClient.call.mockRejectedValueOnce(innerReplayRevert);

    const thrown = await write().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).cause).toBe(innerReplayRevert);
    expect(mockPublicClient.call).toHaveBeenCalledTimes(1);
    expect(mockPublicClient.call).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: REGISTRY,
        data: encodeFunctionData({
          abi: APPROVE_ABI,
          functionName: "approve",
          args: ["0x3000000000000000000000000000000000000003", 1n],
        }),
        account: SENDER,
        gas: MINED_GAS,
        blockNumber: 5n,
      }),
    );
  });

  it("falls back to replaying the transaction as mined when the intended call does not revert", async () => {
    const minedReplayRevert = new Error("mined replay reverted");
    mockPublicClient.call
      .mockResolvedValueOnce({ data: "0x" })
      .mockRejectedValueOnce(minedReplayRevert);

    const thrown = await write().catch((e: unknown) => e);

    expect(mockPublicClient.call).toHaveBeenCalledTimes(2);
    expect(mockPublicClient.call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: MINED_TO,
        data: MINED_INPUT,
        account: MINED_FROM,
        gas: MINED_GAS,
        value: 0n,
        accessList: ACCESS_LIST,
        blockNumber: 5n,
      }),
    );
    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as ContractError).cause).toBe(minedReplayRevert);
  });

  it("reports the reason as unavailable, from copy, when neither replay reverts", async () => {
    mockPublicClient.call.mockResolvedValue({ data: "0x" });

    const thrown = await write().catch((e: unknown) => e);

    expect(mockPublicClient.call).toHaveBeenCalledTimes(2);
    expect(mockPublicClient.call).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: REGISTRY, account: SENDER }),
    );
    expect(mockPublicClient.call).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: MINED_TO, account: MINED_FROM }),
    );
    expect(thrown).toBeInstanceOf(ContractError);
    expect((thrown as Error).message).toContain(
      COPY.common.transactionRevertedReasonUnavailable("0xabc"),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), {
      data: { hash: "0xabc" },
    });
  });

  it("reports out of gas, from copy, without replaying when nearly all gas was used", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      gasUsed: 960n,
      blockNumber: 5n,
      transactionHash: "0xabc",
      logs: [],
    });
    mockPublicClient.getTransaction.mockResolvedValue({
      gas: 1000n,
      to: MINED_TO,
      input: MINED_INPUT,
      from: MINED_FROM,
    });

    const thrown = await write().catch((e: unknown) => e);

    expect((thrown as Error).message).toContain(
      COPY.common.transactionOutOfGas("960", "1000"),
    );
    expect(mockPublicClient.call).not.toHaveBeenCalled();
  });
});

describe("executeWrite Safe polling bound", () => {
  beforeEach(() => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });
  });

  it("bounds the receipt wait's Safe polling when the caller gives a bound", async () => {
    await write({ safePollTimeoutMs: 60_000 });

    expect(mockWaitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: "0xsent", safePollTimeoutMs: 60_000 }),
    );
  });

  it("leaves the SDK's own Safe polling budget when the caller gives none", async () => {
    await write();

    expect(mockWaitReceipt.mock.calls[0][0].safePollTimeoutMs).toBeUndefined();
  });
});

describe("executeWrite wallet nonce handling", () => {
  it("waits for the wallet to count the mined transaction before returning", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });

    await expect(write()).resolves.toMatchObject({
      transactionHash: "0xmined",
    });
    expect(mockWaitForWalletToCountTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient,
        publicClient: mockPublicClient,
        account: "0x2000000000000000000000000000000000000002",
        receipt: expect.objectContaining({ transactionHash: "0xmined" }),
      }),
    );
  });

  it("simulates again when the send is retried after a stale nonce", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({
        send,
        prepare,
        walletClient,
      }: {
        send: (submissionClient: unknown) => Promise<unknown>;
        prepare: () => Promise<void>;
        walletClient: unknown;
      }) => {
        await prepare();
        return send(walletClient);
      },
    );

    await write();

    expect(mockPublicClient.simulateContract).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed re-simulation before the retry tagged as simulation-phase", async () => {
    mockPublicClient.simulateContract
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("execution reverted"));
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({ prepare }: { prepare: () => Promise<void> }) => {
        await prepare();
      },
    );

    const thrown = await write().catch((e: unknown) => e);

    expect(isSimulationPhaseError(thrown)).toBe(true);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("writes through the submission client the stale-nonce helper hands it, not the connected wallet client", async () => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    const submissionClient = {
      writeContract: vi.fn().mockRejectedValue(new Error("stop here")),
    };
    mockSendWithStaleNonceRetry.mockImplementation(
      ({
        send,
      }: {
        send: (client: typeof submissionClient) => Promise<unknown>;
      }) => send(submissionClient),
    );

    await write().catch(() => undefined);

    expect(submissionClient.writeContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("passes a send whose outcome is unknown through as is, so the caller does not report it as failed", async () => {
    const unknown = new SendOutcomeUnknownError(
      new Error("nonce too low: next nonce 789, tx nonce 788"),
    );
    mockSendWithStaleNonceRetry.mockRejectedValue(unknown);

    await expect(write()).rejects.toBe(unknown);
  });
});

describe("executeWrite gas limit", () => {
  beforeEach(() => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });
  });

  it("forwards the caller's gas limit to the pre-flight simulation and the wallet", async () => {
    await write({ gas: 4_500_000n });

    expect(mockPublicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ gas: 4_500_000n }),
    );
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ gas: 4_500_000n }),
    );
  });

  it("leaves the gas limit to the wallet when the caller gives none", async () => {
    await write();

    expect(
      mockPublicClient.simulateContract.mock.calls[0][0].gas,
    ).toBeUndefined();
    expect(walletClient.writeContract.mock.calls[0][0].gas).toBeUndefined();
  });
});

describe("executeWrite caller pre-flight", () => {
  beforeEach(() => {
    mockPublicClient.simulateContract.mockResolvedValue({});
    walletClient.writeContract.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });
  });

  it("runs the caller's pre-flight in place of the eth_call simulation", async () => {
    const preflight = vi.fn().mockResolvedValue(undefined);

    await write({ preflight });

    expect(preflight).toHaveBeenCalledOnce();
    expect(mockPublicClient.simulateContract).not.toHaveBeenCalled();
    expect(walletClient.writeContract).toHaveBeenCalledOnce();
  });

  it("runs the caller's pre-flight again before a stale-nonce resend", async () => {
    const preflight = vi.fn().mockResolvedValue(undefined);
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({
        send,
        prepare,
        walletClient,
      }: {
        send: (submissionClient: unknown) => Promise<unknown>;
        prepare: () => Promise<void>;
        walletClient: unknown;
      }) => {
        await prepare();
        return send(walletClient);
      },
    );

    await write({ preflight });

    expect(preflight).toHaveBeenCalledTimes(2);
  });

  it("surfaces the caller's pre-flight error as is and signs nothing", async () => {
    const refusal = new Error("would redeem");
    const preflight = vi.fn().mockRejectedValue(refusal);

    await expect(write({ preflight })).rejects.toBe(refusal);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("surfaces the caller's pre-flight error as is before a stale-nonce resend", async () => {
    const refusal = new Error("would redeem");
    const preflight = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(refusal);
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({
        send,
        prepare,
        walletClient,
      }: {
        send: (submissionClient: unknown) => Promise<unknown>;
        prepare: () => Promise<void>;
        walletClient: unknown;
      }) => {
        await prepare();
        return send(walletClient);
      },
    );

    await expect(write({ preflight })).rejects.toBe(refusal);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
