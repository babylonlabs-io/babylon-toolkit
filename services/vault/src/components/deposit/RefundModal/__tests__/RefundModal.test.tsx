import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

  it("disables Confirm and shows the fraction-cap banner for a small vault at a within-rate-cap fee", async () => {
    // Small vault where rate is below the per-vbyte ceiling but absolute
    // fee still consumes more than 10% of vault.amount.
    // 100k-sat vault, halfHourFee=100 sat/vB → fee=16_000 > 10% of 100k.
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 100_000n,
      halfHourFeeSatsVb: 100,
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
