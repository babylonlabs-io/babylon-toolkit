import {
  getTipHeight,
  getTxInfo,
  MempoolNotFoundError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBtcMempoolConfirmations } from "../useBtcMempoolConfirmations";

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTxInfo: vi.fn(),
  getTipHeight: vi.fn(),
}));

const mockGetTxInfo = vi.mocked(getTxInfo);
const mockGetTipHeight = vi.mocked(getTipHeight);

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  client.clear();
  vi.resetAllMocks();
});

describe("useBtcMempoolConfirmations", () => {
  const txid =
    "84b76da7c950b28d9278f1d5895e896b5793d206aa05f66086d5d173096ef531";
  const queryKey = ["refundConfirmations", txid];
  const notFound = new MempoolNotFoundError("Transaction not found");

  function seedPriorResult(confirmations: number | null) {
    client.setQueryData(queryKey, new Map([[txid, confirmations]]), {
      updatedAt: 1,
    });
  }

  // One poll whose tip lookup succeeds and whose tx lookup fails with `error`.
  // A successful query proves the per-txid catch built the map, not a
  // rejected query that kept the seeded data.
  async function pollWithLookupError(error: Error) {
    mockGetTipHeight.mockResolvedValue(800_000);
    mockGetTxInfo.mockRejectedValue(error);
    const { result } = renderHook(
      () => useBtcMempoolConfirmations([txid], queryKey[0]),
      { wrapper },
    );
    await waitFor(() =>
      expect(client.getQueryState(queryKey)?.fetchStatus).toBe("idle"),
    );
    expect(mockGetTxInfo).toHaveBeenCalledOnce();
    expect(client.getQueryState(queryKey)?.status).toBe("success");
    return result.current.confirmationsByTxid;
  }

  it("records a 404 with no prior count as not found", async () => {
    const confirmations = await pollWithLookupError(notFound);
    expect(confirmations.get(txid)).toBeNull();
  });

  it("keeps a known count of 0 when the lookup returns 404", async () => {
    seedPriorResult(0);
    const confirmations = await pollWithLookupError(notFound);
    expect(confirmations.get(txid)).toBe(0);
  });

  it("keeps a known count of 6 when the lookup returns 404", async () => {
    seedPriorResult(6);
    const confirmations = await pollWithLookupError(notFound);
    expect(confirmations.get(txid)).toBe(6);
  });

  it.each([
    new Error("429"),
    new Error("500"),
    new TypeError("Network error"),
    new DOMException("Timed out", "TimeoutError"),
  ])(
    "leaves the txid unknown when the lookup fails with %s and no prior count",
    async (error) => {
      const confirmations = await pollWithLookupError(error);
      expect(confirmations.has(txid)).toBe(false);
    },
  );

  it("drops a prior not-found result when the lookup fails", async () => {
    seedPriorResult(null);
    const confirmations = await pollWithLookupError(
      new TypeError("Network error"),
    );
    expect(confirmations.has(txid)).toBe(false);
  });

  it("keeps a known count of 0 when the lookup fails", async () => {
    seedPriorResult(0);
    const confirmations = await pollWithLookupError(new Error("500"));
    expect(confirmations.get(txid)).toBe(0);
  });

  it("keeps a known count of 6 when the lookup fails", async () => {
    seedPriorResult(6);
    const confirmations = await pollWithLookupError(new Error("500"));
    expect(confirmations.get(txid)).toBe(6);
  });

  it("recovers when a missing transaction appears and confirms", async () => {
    mockGetTipHeight.mockResolvedValue(800_000);
    mockGetTxInfo.mockRejectedValue(notFound);
    const { result } = renderHook(
      () => useBtcMempoolConfirmations([txid], queryKey[0]),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.confirmationsByTxid.get(txid)).toBeNull(),
    );

    for (const [status, confirmations] of [
      [{ confirmed: false }, 0],
      [{ confirmed: true, block_height: 799_995 }, 6],
    ] as const) {
      mockGetTxInfo.mockResolvedValue({ status } as Awaited<
        ReturnType<typeof getTxInfo>
      >);
      await act(async () => {
        await client.refetchQueries({ queryKey });
      });
      await waitFor(() =>
        expect(result.current.confirmationsByTxid.get(txid)).toBe(
          confirmations,
        ),
      );
    }
  });

  it("does not classify a failed tip lookup as a missing transaction", async () => {
    mockGetTipHeight.mockRejectedValue(notFound);
    const { result } = renderHook(
      () => useBtcMempoolConfirmations([txid], queryKey[0]),
      { wrapper },
    );
    await waitFor(() =>
      expect(client.getQueryState(queryKey)?.status).toBe("error"),
    );
    expect(mockGetTxInfo).not.toHaveBeenCalled();
    expect(result.current.confirmationsByTxid.has(txid)).toBe(false);
  });
});
