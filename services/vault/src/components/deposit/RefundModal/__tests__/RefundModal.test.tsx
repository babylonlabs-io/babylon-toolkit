import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRefundPreview } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

import { RefundModal } from "../index";

vi.mock("@/services/vault/vaultRefundService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/vault/vaultRefundService")
    >();
  return {
    ...actual,
    getRefundPreview: vi.fn(async () => ({
      amountSats: 1_000_000n,
      halfHourFeeSatsVb: 5,
      prePeginOnChain: true,
    })),
  };
});

vi.mock("@/hooks/deposit/useRefundState", () => ({
  useRefundState: vi.fn(() => ({
    refunding: false,
    refundTxId: null,
    error: null,
    handleRefund: vi.fn(),
  })),
}));

vi.mock("@/clients/eth-contract/chainlink", () => ({
  getTokenPrices: vi.fn(async () => ({
    prices: { BTC: 50_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  })),
}));

const ACTIVITY: VaultActivity = {
  id: "0xdeadbeef",
  collateral: { amount: "0.01", symbol: "BTC" },
  providers: [{ id: "0xprovider" }],
  displayLabel: "Pending",
  unsignedPrePeginTx: "0x",
  depositorWotsPkHash: "0x",
};

function Wrapper({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("RefundModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the review content", async () => {
    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(await screen.findByText("Review Refund")).toBeInTheDocument();
  });

  it("disables Confirm and shows the rate-cap banner when mempool returns a malicious fee rate", async () => {
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 100_000_000n,
      halfHourFeeSatsVb: 10_000,
      prePeginOnChain: true,
    });

    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(
      await screen.findByText(/safety cap of 2000 sat\/vB/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("holds a loading state until the refund preview resolves", () => {
    // While getRefundPreview is pending the modal must show neither the
    // refund form nor the not-refundable view — picking either before the
    // preview resolves flashes the wrong screen.
    vi.mocked(getRefundPreview).mockReturnValueOnce(
      new Promise(() => {}), // never resolves
    );

    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(screen.queryByText("Review Refund")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing to refund")).not.toBeInTheDocument();
  });

  it("shows 'nothing to refund' when the Pre-PegIn is not on Bitcoin", async () => {
    // Expired vault whose Pre-PegIn never reached Bitcoin — no HTLC output
    // exists to spend, so the modal must not offer the refund form.
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 1_000_000n,
      halfHourFeeSatsVb: 5,
      prePeginOnChain: false,
    });
    const onClose = vi.fn();

    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={onClose}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(await screen.findByText("Nothing to refund")).toBeInTheDocument();
    expect(screen.queryByText("Review Refund")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /confirm/i }),
    ).not.toBeInTheDocument();

    // The view's only action is its Close button — it must dismiss the
    // modal. (getByText avoids the dialog's own aria-label="Close" X.)
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Confirm and shows the fraction-cap banner for a small vault at a within-rate-cap fee", async () => {
    // Small vault where rate is below the per-vbyte ceiling but absolute
    // fee still consumes more than 10% of vault.amount.
    // 100k-sat vault, halfHourFee=100 sat/vB → fee=16_000 > 10% of 100k.
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 100_000n,
      halfHourFeeSatsVb: 100,
      prePeginOnChain: true,
    });

    render(
      <Wrapper>
        <RefundModal
          open
          activity={ACTIVITY}
          onClose={() => {}}
          onSuccess={() => {}}
        />
      </Wrapper>,
    );

    expect(
      await screen.findByText(/exceeds 10% of the refund amount/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });
});
