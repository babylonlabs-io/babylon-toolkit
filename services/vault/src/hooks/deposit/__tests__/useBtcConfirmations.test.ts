import {
  getTipHeight,
  getTxInfo,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBtcConfirmations } from "../useBtcConfirmations";

vi.mock("@babylonlabs-io/ts-sdk/tbv/core/clients", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTxInfo: vi.fn(),
  getTipHeight: vi.fn(),
}));

const mockGetTxInfo = vi.mocked(getTxInfo);
const mockGetTipHeight = vi.mocked(getTipHeight);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useBtcConfirmations", () => {
  it("does not query the mempool when no txid is provided", () => {
    const { result } = renderHook(() => useBtcConfirmations(null), {
      wrapper,
    });

    expect(result.current.confirmations).toBeNull();
    expect(mockGetTxInfo).not.toHaveBeenCalled();
    expect(mockGetTipHeight).not.toHaveBeenCalled();
  });

  it("derives the confirmation count from the tx status and the chain tip", async () => {
    mockGetTxInfo.mockResolvedValue({
      status: { confirmed: true, block_height: 799_995 },
    } as Awaited<ReturnType<typeof getTxInfo>>);
    mockGetTipHeight.mockResolvedValue(800_000);

    const { result } = renderHook(
      () =>
        useBtcConfirmations(
          "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.confirmations).toBe(6));
  });

  it("reports zero confirmations for a tx still in the mempool", async () => {
    mockGetTxInfo.mockResolvedValue({
      status: { confirmed: false },
    } as Awaited<ReturnType<typeof getTxInfo>>);
    mockGetTipHeight.mockResolvedValue(800_000);

    const { result } = renderHook(
      () =>
        useBtcConfirmations(
          "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.confirmations).toBe(0));
  });
});
