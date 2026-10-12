import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useMemo, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";
import { useRefundState } from "@/hooks/deposit/useRefundState";
import { getRefundPreview } from "@/services/vault/vaultRefundService";
import type { VaultActivity } from "@/types/activity";

import { RefundModal } from "../index";

// The shared v3 modal shell renders the app's top bar (network badge +
// settings), whose graph reaches wallet-connector and can't be transformed
// here. This suite is about the refund content inside it.
// The close control is rendered only when the modal is closable right now.
vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({
    open,
    onClose,
    children,
  }: {
    open: boolean;
    onClose?: () => void;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {onClose && (
          <button type="button" onClick={onClose}>
            close-modal
          </button>
        )}
        {children}
      </div>
    ) : null,
}));

// Ledger device state: default not a Ledger, no wait held.
const ledgerDevice = vi.hoisted(() => ({
  isLedgerVault: false,
  appWait: { status: "ready" } as
    | { status: "ready" }
    | { status: "awaiting-app"; expectedAppName: string },
  cancelAppWait: vi.fn(),
  reconnect: vi.fn(async () => {}),
}));
vi.mock("@/hooks/useLedgerVaultDevice", () => ({
  useLedgerVaultDevice: () => ledgerDevice,
}));

vi.mock("@/services/vault/vaultRefundService", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/vault/vaultRefundService")
    >();
  return {
    ...actual,
    getRefundPreview: vi.fn(async () => ({
      amountSats: 1_000_000n,
      feeCapBasisSats: 1_000_000n,
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
    errorTerminal: false,
    deviceDisconnected: false,
    handleRefund: vi.fn(),
  })),
}));

vi.mock("@/clients/eth-contract/chainlink", () => ({
  getTokenPrices: vi.fn(async () => ({
    prices: { BTC: 50_000 },
    metadata: { BTC: { isStale: false, fetchFailed: false } },
  })),
}));

// RefundReviewContent reads the BTC wallet-lock state to gate the refund; drive
// it through a mutable mock (default unlocked).
const mockBtcWalletState = vi.hoisted(() => ({ locked: false }));
vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => mockBtcWalletState,
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
    mockBtcWalletState.locked = false;
    ledgerDevice.appWait = { status: "ready" };
    // mockReturnValue outlives clearAllMocks; restore the idle state.
    vi.mocked(useRefundState).mockReturnValue({
      refunding: false,
      refundTxId: null,
      error: null,
      errorTerminal: false,
      deviceDisconnected: false,
      handleRefund: vi.fn(),
    });
  });

  function renderRefundModal(onClose: () => void = () => {}) {
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
  }

  it("reconnects the device before retrying after a lost session", async () => {
    const handleRefund = vi.fn(async () => {});
    vi.mocked(useRefundState).mockReturnValue({
      refunding: false,
      refundTxId: null,
      error: COPY.deposit.errors.deviceDisconnected.body,
      errorTerminal: false,
      deviceDisconnected: true,
      handleRefund,
    });
    renderRefundModal();

    fireEvent.click(
      await screen.findByRole("button", {
        name: COPY.deposit.ledger.reconnectButton,
      }),
    );

    await waitFor(() => expect(handleRefund).toHaveBeenCalledTimes(1));
    expect(ledgerDevice.reconnect).toHaveBeenCalledTimes(1);
  });

  it("says the reconnect failed and does not refund when the reconnect fails", async () => {
    const handleRefund = vi.fn(async () => {});
    ledgerDevice.reconnect.mockRejectedValueOnce(
      new Error("No selected device"),
    );
    vi.mocked(useRefundState).mockReturnValue({
      refunding: false,
      refundTxId: null,
      error: COPY.deposit.errors.deviceDisconnected.body,
      errorTerminal: false,
      deviceDisconnected: true,
      handleRefund,
    });
    renderRefundModal();

    fireEvent.click(
      await screen.findByRole("button", {
        name: COPY.deposit.ledger.reconnectButton,
      }),
    );

    expect(
      await screen.findByText(COPY.deposit.ledger.reconnectFailed),
    ).toBeInTheDocument();
    expect(handleRefund).not.toHaveBeenCalled();
  });

  it("shows the app wait during a held refund and lets the modal close by ending the wait", async () => {
    ledgerDevice.appWait = {
      status: "awaiting-app",
      expectedAppName: "Babylon Vault Testnet",
    };
    vi.mocked(useRefundState).mockReturnValue({
      refunding: true,
      refundTxId: null,
      error: null,
      errorTerminal: false,
      deviceDisconnected: false,
      handleRefund: vi.fn(),
    });
    const onClose = vi.fn();
    renderRefundModal(onClose);

    expect(
      await screen.findByText(
        COPY.deposit.ledger.waitingForApp.title("Babylon Vault Testnet"),
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close-modal" }));

    expect(ledgerDevice.cancelAppWait).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers Retry after an error a retry can cure", async () => {
    vi.mocked(useRefundState).mockReturnValue({
      refunding: false,
      refundTxId: null,
      error: "Broadcast failed",
      errorTerminal: false,
      deviceDisconnected: false,
      handleRefund: vi.fn(),
    });
    renderRefundModal();

    expect(await screen.findByText("0.01 sBTC")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.deposit.refundReview.retryButton,
      }),
    ).toBeEnabled();
  });

  it("keeps Confirm disabled, with no Retry, once the PegIn has spent the deposit", async () => {
    vi.mocked(useRefundState).mockReturnValue({
      refunding: false,
      refundTxId: null,
      error: COPY.deposit.refundSweptByPegin.afterSigning,
      errorTerminal: true,
      deviceDisconnected: false,
      handleRefund: vi.fn(),
    });
    renderRefundModal();

    expect(await screen.findByText("0.01 sBTC")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: COPY.deposit.refundReview.confirmButton,
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", {
        name: COPY.deposit.refundReview.retryButton,
      }),
    ).not.toBeInTheDocument();
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

    // The shared review row splits each figure across an amount line and a
    // secondary conversion line; the figures themselves are unchanged.
    // 1,000,000 sats = 0.01 BTC at $50,000 = $500.00.
    expect(screen.getByText("Refund Amount")).toBeInTheDocument();
    expect(screen.getByText("0.01 sBTC")).toBeInTheDocument();
    expect(await screen.findByText("$500.00 USD")).toBeInTheDocument();
  });

  it("disables Confirm and shows the rate-cap banner when mempool returns a malicious fee rate", async () => {
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 100_000_000n,
      feeCapBasisSats: 100_000_000n,
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

  it("disables Confirm and shows the lock notice when the BTC wallet is locked", async () => {
    mockBtcWalletState.locked = true;

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

    const notice = (
      await screen.findByText("Bitcoin wallet is locked")
    ).closest('[role="alert"]');

    expect(notice).toBeInTheDocument();
    expect(notice?.querySelector("svg path")?.getAttribute("d")).toMatch(
      /^M18 8H17V6/,
    );
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
      feeCapBasisSats: 1_000_000n,
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

  it("caps the fee against the deposit basis, not the larger refund amount, for a small vault", async () => {
    // The cap mirrors the SDK, which keys off the deposit amount
    // (feeCapBasisSats), not the funded HTLC value shown as amountSats.
    // halfHourFee=100 sat/vB → fee=16_000. That is > 10% of the 100k deposit
    // basis (10_000) so the banner must show, yet < 10% of the 200k funded
    // amount (20_000) — so a cap keyed off amountSats would wrongly pass.
    vi.mocked(getRefundPreview).mockResolvedValueOnce({
      amountSats: 200_000n,
      feeCapBasisSats: 100_000n,
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
      await screen.findByText(/exceeds the 10% refund safety cap/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });
});
