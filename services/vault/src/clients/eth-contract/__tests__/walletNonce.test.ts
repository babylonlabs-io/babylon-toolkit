import { NonceTooLowError, RpcRequestError } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTransactionCount, mockGetTransactionReceipt, mockWarn } =
  vi.hoisted(() => ({
    mockGetTransactionCount: vi.fn(),
    mockGetTransactionReceipt: vi.fn(),
    mockWarn: vi.fn(),
  }));

vi.mock("viem/actions", () => ({
  getTransactionCount: (...args: unknown[]) => mockGetTransactionCount(...args),
  getTransactionReceipt: (...args: unknown[]) =>
    mockGetTransactionReceipt(...args),
}));

vi.mock("@/infrastructure", () => ({
  logger: { warn: mockWarn, error: vi.fn(), info: vi.fn(), event: vi.fn() },
}));

import {
  sendWithStaleNonceRetry,
  waitForWalletNonce,
  waitForWalletToCountTransaction,
  WALLET_NONCE_POLL_INTERVAL_MS,
  WALLET_NONCE_SYNC_TIMEOUT_MS,
} from "../walletNonce";

const ACCOUNT = "0xAbCdEf0000000000000000000000000000000002";
const ACCOUNT_LOWERCASE = "0xabcdef0000000000000000000000000000000002";
const OTHER_SENDER = "0x9000000000000000000000000000000000000009";
const HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const walletClient = { chain: { id: 11155111 } } as any;
const publicClient = { getTransaction: vi.fn() } as any;

function nodeError(message: string): NonceTooLowError {
  return new NonceTooLowError({
    cause: new RpcRequestError({
      body: {},
      error: { code: -32000, message },
      url: "https://rpc.example",
    }),
  });
}

function staleNonceError(): NonceTooLowError {
  return nodeError("nonce too low: next nonce 788, tx nonce 787");
}

/** A read that never answers, like a wallet holding a request. */
function neverAnswers(): Promise<never> {
  return new Promise(() => {});
}

/** Answer count reads per client: the app's public client or the wallet. */
function countsBy({
  app,
  wallet,
}: {
  app: () => Promise<number>;
  wallet: () => Promise<number>;
}) {
  mockGetTransactionCount.mockImplementation((client: unknown) =>
    client === publicClient ? app() : wallet(),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  mockGetTransactionReceipt.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("waitForWalletNonce", () => {
  it("reads the count from the wallet client at the latest block", async () => {
    mockGetTransactionCount.mockResolvedValue(5);

    await waitForWalletNonce({
      walletClient,
      account: ACCOUNT,
      minimumCount: 5,
    });

    expect(mockGetTransactionCount).toHaveBeenCalledWith(walletClient, {
      address: ACCOUNT,
      blockTag: "latest",
    });
  });

  it("keeps polling until the wallet counts the transaction", async () => {
    mockGetTransactionCount
      .mockResolvedValueOnce(787)
      .mockResolvedValueOnce(787)
      .mockResolvedValueOnce(788);

    const result = waitForWalletNonce({
      walletClient,
      account: ACCOUNT,
      minimumCount: 788,
    });
    await vi.advanceTimersByTimeAsync(2 * WALLET_NONCE_POLL_INTERVAL_MS);

    await expect(result).resolves.toMatchObject({
      status: "synced",
      walletCount: 788,
    });
    expect(mockGetTransactionCount).toHaveBeenCalledTimes(3);
  });

  it("asks the wallet for the receipt before every count read", async () => {
    const calls: string[] = [];
    mockGetTransactionReceipt.mockImplementation(async () => {
      calls.push("receipt");
      throw new Error("not found");
    });
    mockGetTransactionCount
      .mockImplementationOnce(async () => {
        calls.push("count");
        return 787;
      })
      .mockImplementationOnce(async () => {
        calls.push("count");
        return 788;
      });

    const result = waitForWalletNonce({
      walletClient,
      account: ACCOUNT,
      minimumCount: 788,
      nudgeHash: HASH,
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_POLL_INTERVAL_MS);

    await expect(result).resolves.toMatchObject({ status: "synced" });
    expect(calls).toEqual(["receipt", "count", "receipt", "count"]);
    expect(mockGetTransactionReceipt).toHaveBeenCalledWith(walletClient, {
      hash: HASH,
    });
  });

  it("gives up with the last count once the timeout passes", async () => {
    mockGetTransactionCount.mockResolvedValue(787);

    const result = waitForWalletNonce({
      walletClient,
      account: ACCOUNT,
      minimumCount: 788,
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(result).resolves.toMatchObject({
      status: "timeout",
      walletCount: 787,
    });
  });

  it("gives up at the timeout when the wallet never answers a read", async () => {
    mockGetTransactionReceipt.mockImplementation(neverAnswers);
    mockGetTransactionCount.mockImplementation(neverAnswers);

    const result = waitForWalletNonce({
      walletClient,
      account: ACCOUNT,
      minimumCount: 788,
      nudgeHash: HASH,
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(result).resolves.toMatchObject({
      status: "timeout",
      walletCount: null,
    });
  });

  it("stops waiting when the wallet's provider rejects the count read", async () => {
    mockGetTransactionCount.mockRejectedValue(
      new Error("method not supported"),
    );

    await expect(
      waitForWalletNonce({ walletClient, account: ACCOUNT, minimumCount: 788 }),
    ).resolves.toMatchObject({
      status: "unavailable",
      error: "method not supported",
    });
  });

  it("gives up when the deadline passes while a count read is in flight", async () => {
    mockGetTransactionCount.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + WALLET_NONCE_SYNC_TIMEOUT_MS);
      return 787;
    });

    await expect(
      waitForWalletNonce({ walletClient, account: ACCOUNT, minimumCount: 788 }),
    ).resolves.toMatchObject({ status: "timeout", walletCount: 787 });
    expect(mockGetTransactionCount).toHaveBeenCalledTimes(1);
  });
});

describe("waitForWalletToCountTransaction", () => {
  it("waits for the wallet to count one past the mined nonce", async () => {
    publicClient.getTransaction.mockResolvedValue({ nonce: 787 });
    mockGetTransactionCount
      .mockResolvedValueOnce(787)
      .mockResolvedValueOnce(788);

    const done = waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT_LOWERCASE, transactionHash: HASH },
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_POLL_INTERVAL_MS);
    await done;

    expect(publicClient.getTransaction).toHaveBeenCalledWith({ hash: HASH });
    expect(mockGetTransactionCount).toHaveBeenCalledTimes(2);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("does not wait for a transaction another address sent, such as a Safe's executor", async () => {
    await waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: OTHER_SENDER, transactionHash: HASH },
    });

    expect(publicClient.getTransaction).not.toHaveBeenCalled();
    expect(mockGetTransactionCount).not.toHaveBeenCalled();
  });

  it("reads the mined transaction again when the app's RPC has not seen it yet", async () => {
    publicClient.getTransaction
      .mockRejectedValueOnce(new Error("transaction not found"))
      .mockResolvedValueOnce({ nonce: 787 });
    mockGetTransactionCount.mockResolvedValue(788);

    const done = waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT, transactionHash: HASH },
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_POLL_INTERVAL_MS);
    await done;

    expect(publicClient.getTransaction).toHaveBeenCalledTimes(2);
    expect(mockGetTransactionCount).toHaveBeenCalledTimes(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("logs and returns when the mined transaction stays unreadable until the timeout", async () => {
    publicClient.getTransaction.mockRejectedValue(new Error("rpc down"));

    const done = waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT, transactionHash: HASH },
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(done).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      "Could not read a mined transaction to wait for the wallet",
      expect.anything(),
    );
    expect(mockGetTransactionCount).not.toHaveBeenCalled();
  });

  it("logs and returns at the timeout when the mined transaction read never answers", async () => {
    publicClient.getTransaction.mockImplementation(neverAnswers);

    const done = waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT, transactionHash: HASH },
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(done).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      "Could not read a mined transaction to wait for the wallet",
      expect.anything(),
    );
    expect(mockGetTransactionCount).not.toHaveBeenCalled();
  });

  it("spends one timeout budget across reading the mined transaction and waiting for the wallet", async () => {
    const minedReadMs = WALLET_NONCE_SYNC_TIMEOUT_MS - 5_000;
    publicClient.getTransaction.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + minedReadMs);
      return { nonce: 787 };
    });
    mockGetTransactionCount.mockResolvedValue(787);
    let settled = false;

    void waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT, transactionHash: HASH },
    }).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(
      WALLET_NONCE_SYNC_TIMEOUT_MS - minedReadMs,
    );

    expect(settled).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith(
      "The wallet had not counted a mined transaction",
      expect.objectContaining({
        data: expect.objectContaining({ status: "timeout" }),
      }),
    );
  });

  it("logs and returns when the wallet never catches up", async () => {
    publicClient.getTransaction.mockResolvedValue({ nonce: 787 });
    mockGetTransactionCount.mockResolvedValue(787);

    const done = waitForWalletToCountTransaction({
      walletClient,
      publicClient,
      account: ACCOUNT,
      receipt: { from: ACCOUNT, transactionHash: HASH },
    });
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(done).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      "The wallet had not counted a mined transaction",
      expect.objectContaining({
        data: expect.objectContaining({ status: "timeout", minedNonce: 787 }),
      }),
    );
  });

  it("logs and returns when the wallet's provider cannot answer the count read", async () => {
    publicClient.getTransaction.mockResolvedValue({ nonce: 787 });
    mockGetTransactionCount.mockRejectedValue(
      new Error("method not supported"),
    );

    await expect(
      waitForWalletToCountTransaction({
        walletClient,
        publicClient,
        account: ACCOUNT,
        receipt: { from: ACCOUNT, transactionHash: HASH },
      }),
    ).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      "The wallet had not counted a mined transaction",
      expect.objectContaining({
        data: expect.objectContaining({ status: "unavailable" }),
      }),
    );
  });
});

describe("sendWithStaleNonceRetry", () => {
  it("returns the first send's hash without preparing again", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const send = vi.fn().mockResolvedValue(HASH);
    const prepare = vi.fn();

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).resolves.toBe(HASH);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("waits for the wallet, simulates again and sends once more after a stale nonce", async () => {
    const calls: string[] = [];
    countsBy({
      app: async () => {
        calls.push("app count");
        return 788;
      },
      wallet: async () => {
        calls.push("wallet count");
        return 788;
      },
    });
    const send = vi
      .fn()
      .mockImplementationOnce(async () => {
        calls.push("send");
        throw staleNonceError();
      })
      .mockImplementationOnce(async () => {
        calls.push("send");
        return HASH;
      });
    const prepare = vi.fn(async () => {
      calls.push("prepare");
    });

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).resolves.toBe(HASH);
    expect(calls).toEqual([
      "app count",
      "send",
      "app count",
      "wallet count",
      "prepare",
      "send",
    ]);
  });

  it("does not retry when the account's count moved during the send, since the rejected transaction may have mined", async () => {
    const appCounts = [788, 789];
    countsBy({
      app: async () => appCounts.shift()!,
      wallet: async () => 789,
    });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);
    const prepare = vi.fn();

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not retry when the account's count could not be read before the send", async () => {
    const appCounts: (() => Promise<number>)[] = [
      async () => {
        throw new Error("rpc down");
      },
      async () => 788,
    ];
    countsBy({ app: () => appCounts.shift()!(), wallet: async () => 788 });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the account's count cannot be read before or after the send", async () => {
    countsBy({
      app: async () => {
        throw new Error("rpc down");
      },
      wallet: async () => 788,
    });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);
    const prepare = vi.fn();

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not retry when the wallet already counts more than the app's RPC, since the app's read may have missed this transaction", async () => {
    countsBy({ app: async () => 788, wallet: async () => 789 });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);
    const prepare = vi.fn();

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not retry when the account's count cannot be read after the rejection", async () => {
    const appCounts: (() => Promise<number>)[] = [
      async () => 788,
      async () => {
        throw new Error("rpc down");
      },
    ];
    countsBy({ app: () => appCounts.shift()!(), wallet: async () => 788 });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not prompt again when the wallet cannot say it caught up", async () => {
    countsBy({
      app: async () => 788,
      wallet: async () => {
        throw new Error("method not supported");
      },
    });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);
    const prepare = vi.fn();

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("does not prompt again when the wallet is still behind at the timeout", async () => {
    countsBy({ app: async () => 788, wallet: async () => 787 });
    const rejection = staleNonceError();
    const send = vi.fn().mockRejectedValue(rejection);

    const result = sendWithStaleNonceRetry({
      walletClient,
      publicClient,
      account: ACCOUNT,
      send,
      prepare: vi.fn(),
    }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(WALLET_NONCE_SYNC_TIMEOUT_MS);

    await expect(result).resolves.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send again when the new simulation fails", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const send = vi.fn().mockRejectedValue(staleNonceError());
    const simulationError = new Error("execution reverted");
    const prepare = vi.fn().mockRejectedValue(simulationError);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare,
      }),
    ).rejects.toBe(simulationError);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("lets a second stale nonce propagate", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const send = vi
      .fn()
      .mockRejectedValueOnce(staleNonceError())
      .mockRejectedValueOnce(staleNonceError());

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(NonceTooLowError);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the node already knows the transaction", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const rejection = nodeError("already known");
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the node already imported the transaction", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const rejection = nodeError("transaction already imported");
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry a replacement-underpriced rejection", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const rejection = new Error(
      "replacement transaction underpriced: a transaction with this nonce is pending",
    );
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not retry a user rejection", async () => {
    countsBy({ app: async () => 788, wallet: async () => 788 });
    const rejection = Object.assign(new Error("User rejected the request."), {
      code: 4001,
    });
    const send = vi.fn().mockRejectedValue(rejection);

    await expect(
      sendWithStaleNonceRetry({
        walletClient,
        publicClient,
        account: ACCOUNT,
        send,
        prepare: vi.fn(),
      }),
    ).rejects.toBe(rejection);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
