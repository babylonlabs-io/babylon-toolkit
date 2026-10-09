/**
 * The receipt-wait classifiers, fed the errors the real SDK wait produces for
 * a Safe wallet, so a reworded SDK message fails here instead of silently
 * changing what the app treats as a definite answer.
 */

import { waitForTransactionReceiptSmartAware } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import {
  BlockNotFoundError,
  HttpRequestError,
  WaitForTransactionReceiptTimeoutError,
  type PublicClient,
} from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isDefinitiveReceiptWaitFailure,
  isTransientReceiptWaitError,
} from "../transactionOutcome";

const SAFE = "0x2000000000000000000000000000000000000002";
const SAFE_TX_HASH =
  "0x5555555555555555555555555555555555555555555555555555555555555555";

/** A connected Safe on Sepolia, where the SDK knows the Safe Transaction Service. */
const safeClient = {
  chain: { id: 11155111 },
  getCode: vi.fn(async () => "0x608060405234801561001057600080fd5b50"),
} as unknown as PublicClient;

/** What the SDK wait rejects with when the Safe Transaction Service answers `response`. */
async function safeWaitError(response: Partial<Response>): Promise<unknown> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  return waitForTransactionReceiptSmartAware({
    publicClient: safeClient,
    walletAddress: SAFE,
    hash: SAFE_TX_HASH,
    safePollIntervalMs: 1,
    safePollTimeoutMs: 20,
  }).catch((e: unknown) => e);
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isDefinitiveReceiptWaitFailure", () => {
  it("is true for the SDK reporting a Safe transaction that executed and reverted", async () => {
    const error = await safeWaitError({
      ok: true,
      json: async () => ({ isExecuted: true, isSuccessful: false }),
    });

    expect(isDefinitiveReceiptWaitFailure(error)).toBe(true);
  });

  it("is false for the SDK giving up while a Safe proposal is still pending in the queue", async () => {
    const error = await safeWaitError({
      ok: true,
      json: async () => ({ isExecuted: false }),
    });

    expect(error).toBeInstanceOf(Error);
    expect(isDefinitiveReceiptWaitFailure(error)).toBe(false);
  });

  it("is false for a Safe Transaction Service refusing the request", async () => {
    const error = await safeWaitError({ ok: false, status: 429 });

    expect(error).toBeInstanceOf(Error);
    expect(isDefinitiveReceiptWaitFailure(error)).toBe(false);
  });

  it("is false for a Safe Transaction Service response that is not JSON", async () => {
    const error = await safeWaitError({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    });

    expect(error).toBeInstanceOf(SyntaxError);
    expect(isDefinitiveReceiptWaitFailure(error)).toBe(false);
  });

  it("is false for viem's receipt timeout", () => {
    expect(
      isDefinitiveReceiptWaitFailure(
        new WaitForTransactionReceiptTimeoutError({ hash: SAFE_TX_HASH }),
      ),
    ).toBe(false);
  });
});

describe("isTransientReceiptWaitError", () => {
  it("is true for viem's receipt timeout, an RPC transport failure and a lagging block", () => {
    expect(
      isTransientReceiptWaitError(
        new WaitForTransactionReceiptTimeoutError({ hash: SAFE_TX_HASH }),
      ),
    ).toBe(true);
    expect(
      isTransientReceiptWaitError(
        new HttpRequestError({ url: "https://rpc.example" }),
      ),
    ).toBe(true);
    expect(
      isTransientReceiptWaitError(new BlockNotFoundError({ blockNumber: 1n })),
    ).toBe(true);
  });

  it("is true for the Safe Transaction Service rate-limiting or timing out the request", async () => {
    const rateLimited = await safeWaitError({ ok: false, status: 429 });
    const timedOut = await safeWaitError({ ok: false, status: 408 });

    expect(isTransientReceiptWaitError(rateLimited)).toBe(true);
    expect(isTransientReceiptWaitError(timedOut)).toBe(true);
  });

  it("is true for the SDK giving up while a Safe proposal is still pending in the queue", async () => {
    const error = await safeWaitError({
      ok: true,
      json: async () => ({ isExecuted: false }),
    });

    expect(isTransientReceiptWaitError(error)).toBe(true);
  });

  it("is false for a Safe Transaction Service refusing the request, which another round gets again", async () => {
    const error = await safeWaitError({ ok: false, status: 403 });

    expect(isTransientReceiptWaitError(error)).toBe(false);
  });
});
