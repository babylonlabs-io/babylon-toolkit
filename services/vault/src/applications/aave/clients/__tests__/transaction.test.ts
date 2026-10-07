import { encodeErrorResult, type Chain, type WalletClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import {
  ContractError,
  ErrorCode,
  isSimulationPhaseError,
} from "@/utils/errors";

const {
  mockPublicClient,
  mockWaitReceipt,
  mockSendWithStaleNonceRetry,
  mockWaitForWalletToCountTransaction,
  mockSwitchChain,
  mockGetWalletClient,
  sharedWagmiConfig,
} = vi.hoisted(() => ({
  mockPublicClient: {
    call: vi.fn(),
  },
  mockWaitReceipt: vi.fn(),
  mockSendWithStaleNonceRetry: vi.fn(),
  mockWaitForWalletToCountTransaction: vi.fn(),
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
}));

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/utils", () => ({
  waitForTransactionReceiptSmartAware: (...args: unknown[]) =>
    mockWaitReceipt(...args),
}));

vi.mock("@/config/network", () => ({
  getETHChain: () => ({ id: 1 }),
}));

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
  });
});

describe("executeTx wallet nonce handling (via repayToCorePosition)", () => {
  it("waits for the wallet to count the mined transaction before returning", async () => {
    mockPublicClient.call.mockResolvedValue({});
    walletClient.sendTransaction.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
    });

    await expect(repayCall()).resolves.toMatchObject({
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
    mockPublicClient.call.mockResolvedValue({});
    walletClient.sendTransaction.mockResolvedValue("0xsent");
    mockWaitReceipt.mockResolvedValue({
      status: "success",
      transactionHash: "0xmined",
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
      transactionHash: "0xmined",
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
