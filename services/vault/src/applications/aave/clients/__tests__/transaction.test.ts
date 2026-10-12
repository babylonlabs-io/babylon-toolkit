import {
  BlockNotFoundError,
  HttpRequestError,
  WaitForTransactionReceiptTimeoutError,
  encodeErrorResult,
  type Chain,
  type WalletClient,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  TransactionReplacedError,
  UnconfirmedTransactionError,
  isSimulationPhaseError,
} from "@/utils/errors";

const {
  mockPublicClient,
  mockWaitReceipt,
  mockSendWithStaleNonceRetry,
  mockWaitForWalletToCountTransaction,
  mockReadTransaction,
  mockSwitchChain,
  mockGetWalletClient,
  sharedWagmiConfig,
} = vi.hoisted(() => ({
  mockPublicClient: {
    call: vi.fn(),
    getTransaction: vi.fn(),
    getBlockNumber: vi.fn(),
  },
  mockWaitReceipt: vi.fn(),
  mockSendWithStaleNonceRetry: vi.fn(),
  mockWaitForWalletToCountTransaction: vi.fn(),
  mockReadTransaction: vi.fn(),
  mockSwitchChain: vi.fn(),
  mockGetWalletClient: vi.fn(),
  sharedWagmiConfig: { id: "shared-wagmi-config" },
}));

vi.mock("wagmi/actions", () => ({
  switchChain: (...args: unknown[]) => mockSwitchChain(...args),
  getWalletClient: (...args: unknown[]) => mockGetWalletClient(...args),
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  getSharedWagmiConfig: () => sharedWagmiConfig,
}));

vi.mock("../../../../clients/eth-contract/client", () => ({
  ethClient: { getPublicClient: () => mockPublicClient },
}));

vi.mock("../../../../clients/eth-contract/walletNonce", () => ({
  sendWithStaleNonceRetry: (...args: unknown[]) =>
    mockSendWithStaleNonceRetry(...args),
  waitForWalletToCountTransaction: (...args: unknown[]) =>
    mockWaitForWalletToCountTransaction(...args),
  readTransaction: (...args: unknown[]) => mockReadTransaction(...args),
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  waitForTransactionReceiptSmartAware: (...args: unknown[]) =>
    mockWaitReceipt(...args),
}));

vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 1 }),
}));

import { RECEIPT_WAIT_ROUND_MS } from "../../constants";
import {
  borrowFromCorePosition,
  reorderVaults,
  repayToCorePosition,
  withdrawCollaterals,
} from "../transaction";

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

beforeEach(() => {
  vi.clearAllMocks();
  mockSendWithStaleNonceRetry.mockImplementation(
    ({ send }: { send: () => Promise<unknown> }) => send(),
  );
  mockWaitForWalletToCountTransaction.mockResolvedValue(undefined);
});

describe("executeTx simulation-phase tagging (via repayToCorePosition)", () => {
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
    walletClient.sendTransaction.mockRejectedValue(
      new Error("replacement transaction underpriced"),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(isSimulationPhaseError(thrown)).toBe(false);
    expect(thrown).not.toBeInstanceOf(UnconfirmedTransactionError);
  });
});

describe("executeTx after broadcast (via repayToCorePosition)", () => {
  const ACCOUNT = "0x2000000000000000000000000000000000000002";
  const ADAPTER = "0x3000000000000000000000000000000000000003";

  beforeEach(() => {
    mockPublicClient.call.mockResolvedValue({});
    mockPublicClient.getBlockNumber.mockResolvedValue(100n);
    walletClient.sendTransaction.mockResolvedValue("0xsent");
    // Right after the send the app's RPC serves the sent transaction.
    mockReadTransaction.mockResolvedValue({
      transaction: { nonce: 7, from: ACCOUNT },
    });
  });

  /** The calldata the wallet was asked to send. */
  const sentData = () => walletClient.sendTransaction.mock.calls[0][0].data;

  it("keeps the sent hash as unconfirmed when the receipt wait times out", async () => {
    mockWaitReceipt.mockRejectedValue(
      new WaitForTransactionReceiptTimeoutError({ hash: "0xsent" }),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(UnconfirmedTransactionError);
    expect((thrown as UnconfirmedTransactionError).broadcast).toEqual({
      hash: "0xsent",
      from: ACCOUNT,
      to: ADAPTER,
      data: sentData(),
      nonce: 7,
      sentAtBlock: 100n,
    });
    expect(mockWaitForWalletToCountTransaction).not.toHaveBeenCalled();
  });

  it("does not keep a nonce the RPC served for a hash another account sent", async () => {
    mockWaitReceipt.mockRejectedValue(
      new WaitForTransactionReceiptTimeoutError({ hash: "0xsent" }),
    );
    mockReadTransaction.mockResolvedValue({
      transaction: {
        nonce: 900,
        from: "0x4000000000000000000000000000000000000004",
      },
    });

    const thrown = await repayCall().catch((e: unknown) => e);

    expect((thrown as UnconfirmedTransactionError).broadcast.nonce).toBeNull();
  });

  it("keeps the sent hash as unconfirmed when a lagging RPC has not served the block yet", async () => {
    mockWaitReceipt.mockRejectedValue(
      new BlockNotFoundError({ blockNumber: 101n }),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(UnconfirmedTransactionError);
  });

  it("reports a Safe transaction that executed and reverted as a failure, not as unconfirmed", async () => {
    mockWaitReceipt.mockRejectedValue(
      new Error(
        "Safe transaction 0xsent was executed on chain but reverted. Check the Safe queue UI for details.",
      ),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(thrown).not.toBeInstanceOf(UnconfirmedTransactionError);
  });

  it("keeps the sent hash as unconfirmed when the RPC fails while polling for the receipt", async () => {
    mockWaitReceipt.mockRejectedValue(
      new HttpRequestError({ url: "https://rpc.example" }),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(UnconfirmedTransactionError);
    expect((thrown as UnconfirmedTransactionError).transactionHash).toBe(
      "0xsent",
    );
  });

  it("reports a mined revert as a failure even when reading the reverted transaction fails", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "reverted",
      transactionHash: "0xsent",
      from: ACCOUNT,
      gasUsed: 21_000n,
      blockNumber: 1n,
    });
    mockPublicClient.getTransaction.mockRejectedValue(
      new HttpRequestError({ url: "https://rpc.example" }),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(ContractError);
    expect(thrown).not.toBeInstanceOf(UnconfirmedTransactionError);
  });

  it("keeps a Safe proposal the Safe Transaction Service would not report on as unconfirmed", async () => {
    mockWaitReceipt.mockRejectedValue(
      new Error("Safe Transaction Service returned 429 for 0xsent."),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(UnconfirmedTransactionError);
  });

  it("bounds the polling of a Safe proposal, so one still in the queue ends the wait as unconfirmed", async () => {
    mockWaitReceipt.mockRejectedValue(
      new Error(
        "Timed out after 60000ms waiting for Safe transaction 0xsent to reach quorum and execute. The proposal is still pending in the Safe queue.",
      ),
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(mockWaitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ safePollTimeoutMs: RECEIPT_WAIT_ROUND_MS }),
    );
    expect(thrown).toBeInstanceOf(UnconfirmedTransactionError);
  });

  it("rejects the receipt of a cancel the wallet sent in place of the transaction", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xcancel",
      from: ACCOUNT,
    });
    mockReadTransaction.mockResolvedValue({
      transaction: { to: ACCOUNT, input: "0x", nonce: 7, from: ACCOUNT },
    });

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(TransactionReplacedError);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.replaced,
    );
  });

  it("says the outcome is unknown when the replacing transaction cannot be read", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xreplacement",
      from: ACCOUNT,
    });
    mockReadTransaction.mockResolvedValue({
      transaction: null,
      error: "not found",
    });

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(TransactionReplacedError);
    expect((thrown as Error).message).toBe(
      COPY.common.unconfirmedTransaction.replacedOutcomeUnknown,
    );
  });

  it("accepts the receipt of a speed-up that repeats the same call", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xspedup",
      from: ACCOUNT,
    });
    mockReadTransaction.mockImplementation(async () => ({
      transaction: { to: ADAPTER, input: sentData(), nonce: 7, from: ACCOUNT },
    }));

    await expect(repayCall()).resolves.toMatchObject({
      transactionHash: "0xspedup",
    });
  });

  it("does not look for a replacement behind a Safe's receipt, which another account sent", async () => {
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xexecuted",
      from: "0x4000000000000000000000000000000000000004",
    });

    await expect(repayCall()).resolves.toMatchObject({
      transactionHash: "0xexecuted",
    });
    // Only the broadcast's own nonce read, never a replacement lookup.
    expect(mockReadTransaction).toHaveBeenCalledTimes(1);
    expect(mockReadTransaction).toHaveBeenCalledWith(
      mockPublicClient,
      "0xsent",
      expect.any(Number),
    );
  });
});

describe("executeTx wallet nonce handling (via repayToCorePosition)", () => {
  it("waits for the wallet to count the mined transaction before returning", async () => {
    mockPublicClient.call.mockResolvedValue({});
    walletClient.sendTransaction.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xsent",
      from: "0x2000000000000000000000000000000000000002",
    });

    await expect(repayCall()).resolves.toMatchObject({
      transactionHash: "0xsent",
    });
    expect(mockWaitForWalletToCountTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletClient,
        publicClient: mockPublicClient,
        account: "0x2000000000000000000000000000000000000002",
        receipt: expect.objectContaining({ transactionHash: "0xsent" }),
      }),
    );
  });

  it("simulates again when the send is retried after a stale nonce", async () => {
    mockPublicClient.call.mockResolvedValue({});
    walletClient.sendTransaction.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xsent",
      from: "0x2000000000000000000000000000000000000002",
    });
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({
        send,
        prepare,
      }: {
        send: () => Promise<unknown>;
        prepare: () => Promise<void>;
      }) => {
        await prepare();
        return send();
      },
    );

    await repayCall();

    expect(mockPublicClient.call).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed re-simulation before the retry tagged as simulation-phase", async () => {
    mockPublicClient.call
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("execution reverted"));
    mockSendWithStaleNonceRetry.mockImplementation(
      async ({ prepare }: { prepare: () => Promise<void> }) => {
        await prepare();
      },
    );

    const thrown = await repayCall().catch((e: unknown) => e);

    expect(isSimulationPhaseError(thrown)).toBe(true);
    expect(walletClient.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("executeTx network switch", () => {
  const ACCOUNT = "0x2000000000000000000000000000000000000002";
  const ADAPTER = "0x3000000000000000000000000000000000000003";
  const VAULT_ID =
    "0x4000000000000000000000000000000000000000000000000000000000000004";
  const MAINNET = { id: 1 } as Chain;

  const walletOnChain = (chainId: number) => ({
    chain: { id: chainId },
    account: { address: ACCOUNT },
    sendTransaction: vi.fn().mockResolvedValue("0xsent"),
  });

  let wrongChainWallet: ReturnType<typeof walletOnChain>;
  let switchedWallet: ReturnType<typeof walletOnChain>;

  beforeEach(() => {
    mockPublicClient.call.mockResolvedValue({});
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xsent",
      from: "0x2000000000000000000000000000000000000002",
    });
    wrongChainWallet = walletOnChain(2);
    switchedWallet = walletOnChain(1);
    mockSwitchChain.mockResolvedValue(undefined);
    mockGetWalletClient.mockResolvedValue(switchedWallet);
  });

  const expectSwitchedBeforeSend = () => {
    expect(mockSwitchChain).toHaveBeenCalledWith(sharedWagmiConfig, {
      chainId: 1,
    });
    expect(mockGetWalletClient).toHaveBeenCalledWith(sharedWagmiConfig, {
      chainId: 1,
      account: ACCOUNT,
    });
    expect(wrongChainWallet.sendTransaction).not.toHaveBeenCalled();
    expect(switchedWallet.sendTransaction).toHaveBeenCalledTimes(1);
    expect(mockSwitchChain.mock.invocationCallOrder[0]).toBeLessThan(
      switchedWallet.sendTransaction.mock.invocationCallOrder[0],
    );
  };

  it.each([
    {
      action: "borrow",
      send: (wallet: WalletClient) =>
        borrowFromCorePosition(wallet, MAINNET, ADAPTER, 0n, 5n, ACCOUNT),
    },
    {
      action: "repay",
      send: (wallet: WalletClient) =>
        repayToCorePosition(wallet, MAINNET, ADAPTER, ACCOUNT, 0n, 3n),
    },
    {
      action: "withdraw",
      send: (wallet: WalletClient) =>
        withdrawCollaterals(wallet, MAINNET, ADAPTER, [VAULT_ID]),
    },
    {
      action: "reorder",
      send: (wallet: WalletClient) =>
        reorderVaults(wallet, MAINNET, ADAPTER, [VAULT_ID]),
    },
  ])(
    "switches a wallet on the wrong chain to chain 1 before sending a $action",
    async ({ send }) => {
      await send(wrongChainWallet as unknown as WalletClient);

      expectSwitchedBeforeSend();
    },
  );

  it("sends from the connected wallet without a switch prompt when it is already on chain 1", async () => {
    const rightChainWallet = walletOnChain(1);

    await repayToCorePosition(
      rightChainWallet as unknown as WalletClient,
      MAINNET,
      ADAPTER,
      ACCOUNT,
      0n,
      3n,
    );

    expect(mockSwitchChain).not.toHaveBeenCalled();
    expect(mockGetWalletClient).not.toHaveBeenCalled();
    expect(rightChainWallet.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("fails with the switch-network message and sends nothing when the user refuses the switch", async () => {
    mockSwitchChain.mockRejectedValue(new Error("User rejected the request."));

    await expect(
      repayToCorePosition(
        wrongChainWallet as unknown as WalletClient,
        MAINNET,
        ADAPTER,
        ACCOUNT,
        0n,
        3n,
      ),
    ).rejects.toThrow(
      COPY.wallet.chainSwitch.required(COPY.wallet.chainSwitch.ethereumMainnet),
    );
    expect(mockPublicClient.call).not.toHaveBeenCalled();
    expect(wrongChainWallet.sendTransaction).not.toHaveBeenCalled();
    expect(switchedWallet.sendTransaction).not.toHaveBeenCalled();
  });
});
