import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

import { waitForTransactionReceiptSmartAware } from "../waitForTransactionReceiptSmartAware";

const EOA_ADDRESS = "0xb60853e8F260DCEc66Bb9d469E6A672c66406753" as const;
const SAFE_ADDRESS = "0x51C0f61E48E11C3D2c11660087C4c16F4A71Dd43" as const;
const SAFE_TX_HASH =
  "0x154a2d91a71aa2b94854b318854ec47f1a71cb420aa9ac7cc0f8cdfaeaf31c71" as const;
const REAL_TX_HASH =
  "0x2e7459a34ffc919d657626068ab3efe53159e62fa702decb4099131a86f923b7" as const;
const SEPOLIA_CHAIN_ID = 11155111;
const UNSUPPORTED_CHAIN_ID = 137;
/** `eth_getCode` for an EOA that MetaMask upgraded to a smart account: the
 *  EIP-7702 designator `0xef0100` followed by the delegate address. */
const DELEGATED_EOA_CODE =
  "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b" as const;

function makePublicClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getCode: vi.fn(),
    getChainId: vi.fn().mockResolvedValue(SEPOLIA_CHAIN_ID),
    waitForTransactionReceipt: vi.fn(),
    ...overrides,
  } as unknown as PublicClient;
}

describe("waitForTransactionReceiptSmartAware", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("delegates to viem's waitForTransactionReceipt when the wallet is an EOA", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: EOA_ADDRESS,
      hash: REAL_TX_HASH,
      timeout: 10_000,
    });

    expect(receipt).toBe(expectedReceipt);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: REAL_TX_HASH,
      confirmations: undefined,
      timeout: 10_000,
    });
    expect(publicClient.getChainId).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("polls the Safe Transaction Service and resolves with the real tx receipt when the wallet is a smart account", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    // First poll: proposal not yet executed.
    // Second poll: executed and successful, real tx hash available.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          isExecuted: false,
          isSuccessful: null,
          transactionHash: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          isExecuted: true,
          isSuccessful: true,
          transactionHash: REAL_TX_HASH,
        }),
      });

    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: SAFE_ADDRESS,
      hash: SAFE_TX_HASH,
      safePollIntervalMs: 1, // make the test fast
    });

    expect(receipt).toBe(expectedReceipt);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `https://safe-transaction-sepolia.safe.global/api/v1/multisig-transactions/${SAFE_TX_HASH}/`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: REAL_TX_HASH,
      confirmations: undefined,
    });
  });

  it("throws a descriptive error when the Safe transaction executed but reverted on chain", async () => {
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        isExecuted: true,
        isSuccessful: false,
        transactionHash: REAL_TX_HASH,
      }),
    });

    await expect(
      waitForTransactionReceiptSmartAware({
        publicClient,
        walletAddress: SAFE_ADDRESS,
        hash: SAFE_TX_HASH,
        safePollIntervalMs: 1,
      }),
    ).rejects.toThrow(/executed on chain but reverted/);

    expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it("throws a descriptive error when the connected smart account is on an unsupported chain", async () => {
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
      getChainId: vi.fn().mockResolvedValue(UNSUPPORTED_CHAIN_ID),
    });

    await expect(
      waitForTransactionReceiptSmartAware({
        publicClient,
        walletAddress: SAFE_ADDRESS,
        hash: SAFE_TX_HASH,
      }),
    ).rejects.toThrow(
      `Safe Transaction Service not configured for chainId ${UNSUPPORTED_CHAIN_ID}`,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out cleanly when the Safe proposal is never executed", async () => {
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        isExecuted: false,
        isSuccessful: null,
        transactionHash: null,
      }),
    });

    await expect(
      waitForTransactionReceiptSmartAware({
        publicClient,
        walletAddress: SAFE_ADDRESS,
        hash: SAFE_TX_HASH,
        safePollIntervalMs: 1,
        safePollTimeoutMs: 5,
      }),
    ).rejects.toThrow(/Timed out.*waiting for Safe transaction/);
  });

  it("retries when a single fetch hangs / aborts, without consuming the overall budget", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    // First poll: simulate the AbortController firing (transient timeout).
    // Second poll: succeed.
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";

    (fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          isExecuted: true,
          isSuccessful: true,
          transactionHash: REAL_TX_HASH,
        }),
      });

    await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: SAFE_ADDRESS,
      hash: SAFE_TX_HASH,
      safePollIntervalMs: 1,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: REAL_TX_HASH,
      confirmations: undefined,
    });
  });

  it("retries on 404 (proposal not yet indexed) without surfacing an error", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    // First poll 404s, which prompts a one-off "is this address a Safe?"
    // lookup; it is, so polling continues and the next poll succeeds.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          isExecuted: true,
          isSuccessful: true,
          transactionHash: REAL_TX_HASH,
        }),
      });

    await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: SAFE_ADDRESS,
      hash: SAFE_TX_HASH,
      safePollIntervalMs: 1,
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `https://safe-transaction-sepolia.safe.global/api/v1/safes/${SAFE_ADDRESS}/`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("delegates to viem's waitForTransactionReceipt when the wallet is an EIP-7702 delegated EOA", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue(DELEGATED_EOA_CODE),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: EOA_ADDRESS,
      hash: REAL_TX_HASH,
      timeout: 10_000,
    });

    expect(receipt).toBe(expectedReceipt);
    expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: REAL_TX_HASH,
      confirmations: undefined,
      timeout: 10_000,
    });
    expect(publicClient.getChainId).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats bytecode that merely starts with the delegation prefix as a smart account", async () => {
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue(`${DELEGATED_EOA_CODE}60806040`),
      getChainId: vi.fn().mockResolvedValue(UNSUPPORTED_CHAIN_ID),
    });

    await expect(
      waitForTransactionReceiptSmartAware({
        publicClient,
        walletAddress: SAFE_ADDRESS,
        hash: SAFE_TX_HASH,
      }),
    ).rejects.toThrow(
      `Safe Transaction Service not configured for chainId ${UNSUPPORTED_CHAIN_ID}`,
    );
  });

  it("fails immediately instead of polling when the address is not a Safe", async () => {
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
    });

    // The proposal 404s because the hash is not a safeTxHash at all, and the
    // address itself is unknown to the service.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      waitForTransactionReceiptSmartAware({
        publicClient,
        walletAddress: SAFE_ADDRESS,
        hash: REAL_TX_HASH,
        safePollIntervalMs: 1,
        safePollTimeoutMs: 60_000,
      }),
    ).rejects.toThrow(/is not a Safe known to the Safe Transaction Service/);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
  });

  it("keeps polling when the is-this-a-Safe lookup is inconclusive", async () => {
    const expectedReceipt = {
      status: "success" as const,
      transactionHash: REAL_TX_HASH,
    };
    const publicClient = makePublicClient({
      getCode: vi.fn().mockResolvedValue("0x60806040"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue(expectedReceipt),
    });

    // The lookup fails outright (service blip). That proves nothing, so the
    // poll must continue rather than reject a genuine Safe.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockRejectedValueOnce(new Error("network unreachable"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          isExecuted: true,
          isSuccessful: true,
          transactionHash: REAL_TX_HASH,
        }),
      });

    const receipt = await waitForTransactionReceiptSmartAware({
      publicClient,
      walletAddress: SAFE_ADDRESS,
      hash: SAFE_TX_HASH,
      safePollIntervalMs: 1,
    });

    expect(receipt).toBe(expectedReceipt);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
