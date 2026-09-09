/**
 * Loans page states and Repay access, including missing collateral details.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useDashboardStateMock = vi.fn();
const useLoanOverrideMock = vi.fn();
const useHealthFactorOverrideMock = vi.fn();
const useBorrowCapacityOverrideMock = vi.fn();
const openRepayMock = vi.fn();

vi.mock("@/context/wallet", () => ({
  useConnection: () => useConnectionMock(),
  useETHWallet: () => useETHWalletMock(),
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: () => useDashboardStateMock(),
}));

vi.mock("@/hooks/useLoanActions", () => ({
  useLoanActions: () => ({
    openBorrowPicker: vi.fn(),
    openRepay: openRepayMock,
    goToReserve: vi.fn(),
    assetModalProps: {
      isOpen: false,
      onClose: vi.fn(),
      onSelectAsset: vi.fn(),
      mode: "borrow",
      assets: undefined,
    },
  }),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useActiveLoans: () => [],
}));

vi.mock("@/overrides/loans", () => ({
  useLoanOverride: () => useLoanOverrideMock(),
}));

vi.mock("@/overrides/borrowCapacity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/overrides/borrowCapacity")>()),
  useHealthFactorOverride: () => useHealthFactorOverrideMock(),
  useBorrowCapacityOverride: () => useBorrowCapacityOverrideMock(),
}));

vi.mock("react-router", () => ({
  useOutletContext: () => ({ openDeposit: vi.fn() }),
}));

vi.mock("@/components/shared", () => ({
  EmptyState: ({
    isConnected,
    title,
  }: {
    isConnected?: boolean;
    title?: string;
  }) => (
    <div
      data-testid="loans-empty-state"
      data-connected={String(Boolean(isConnected))}
    >
      {title}
    </div>
  ),
}));

vi.mock("../../simple/LoansSummary", () => ({
  LoansSummary: ({
    borrowCapacityLoading,
    borrowCapacityError,
    healthFactor,
    healthFactorStatus,
    totalBorrowed,
    canRepay,
    onRepay,
  }: {
    borrowCapacityLoading: boolean;
    borrowCapacityError: Error | null;
    healthFactor: number | null;
    healthFactorStatus: string;
    totalBorrowed: string;
    canRepay: boolean;
    onRepay: () => void;
  }) => (
    <div
      data-testid="loans-summary"
      data-capacity-loading={String(borrowCapacityLoading)}
      data-capacity-error={String(Boolean(borrowCapacityError))}
      data-health-factor={String(healthFactor)}
      data-health-factor-status={healthFactorStatus}
      data-total-borrowed={totalBorrowed}
    >
      <button disabled={!canRepay} onClick={onRepay}>
        Repay
      </button>
    </div>
  ),
}));

vi.mock("../../simple/ActiveLoansList", () => ({
  ActiveLoansList: () => <div data-testid="active-loans-list" />,
}));

import Loans from "../Loans";

const CONNECTED_LOADED = {
  position: { collaterals: [], vaultIds: [] },
  positionError: null,
  indexerError: null,
  refetchPosition: vi.fn().mockResolvedValue(null),
  debtValueUsd: 0,
  availableToBorrowUsd: 0,
  canBorrow: false,
  healthFactor: 0,
  healthFactorStatus: "safe",
  borrowedAssets: [],
  hasLoans: false,
  hasCollateral: true,
  isBorrowCapacityLoading: false,
  borrowCapacityError: null,
  isLoading: false,
};

const DEMO_LOAN_ROW = {
  reserveId: "demo-reserve-1",
  symbol: "USDC",
  name: "USDC",
  amount: "1500",
  icon: "",
  borrowRate: "5.861%",
  availableLiquidity: 1_250_000,
  utilizationBps: 6420,
  isBorrowable: true,
  displayOnly: true,
};

describe("Loans page — loading gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoanOverrideMock.mockReturnValue(null);
    useHealthFactorOverrideMock.mockReturnValue(null);
    useBorrowCapacityOverrideMock.mockReturnValue(null);
  });

  it("shows the connect prompt while disconnected", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
    });
    render(<Loans />);
    expect(screen.getByText(COPY.loans.emptyDisconnected)).toBeInTheDocument();
    expect(screen.getByTestId("loans-empty-state")).toHaveAttribute(
      "data-connected",
      "false",
    );
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("shows a loader before the first position read finishes", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
      isLoading: true,
    });
    const { container } = render(<Loans />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTestId("loans-empty-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("shows the summary for collateral without a loan", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue(CONNECTED_LOADED);
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.noActiveLoans.title),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  });

  it("keeps Repay available when indexed collateral details are missing", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
      hasLoans: true,
      debtValueUsd: 1500,
      indexerError: new Error("Indexer unavailable"),
    });
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-total-borrowed",
      "$1,500.00 USD",
    );
    expect(
      screen.getByText(COPY.loans.detail.ancillaryLoadWarning),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repay" }));
    expect(openRepayMock).toHaveBeenCalledOnce();
  });

  it("shows the deposit prompt after the chain confirms no position", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
    });
    render(<Loans />);
    expect(screen.getByTestId("loans-empty-state")).toHaveAttribute(
      "data-connected",
      "true",
    );
    expect(
      screen.getByText(COPY.loans.noActiveLoans.title),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("keeps the error and Retry control when a first-load retry fails", async () => {
    const refetchPosition = vi
      .fn()
      .mockRejectedValue(new Error("RPC unavailable"));
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
      positionError: new Error("RPC unavailable"),
      refetchPosition,
    });
    render(<Loans />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.loans.detail.retry }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: COPY.loans.detail.retry }),
      ).toBeEnabled(),
    );
    expect(refetchPosition).toHaveBeenCalledOnce();
    expect(
      screen.getByText(COPY.loans.detail.positionLoadError),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loans-empty-state")).not.toBeInTheDocument();
  });

  it("keeps the loaded debt and Repay action after a background read fails", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasLoans: true,
      debtValueUsd: 1500,
      positionError: new Error("RPC unavailable"),
    });
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-total-borrowed",
      "$1,500.00 USD",
    );
    expect(
      screen.queryByText(COPY.loans.detail.positionLoadError),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.detail.ancillaryLoadWarning),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repay" }));
    expect(openRepayMock).toHaveBeenCalledOnce();
  });

  it("renders injected god-mode loans while disconnected, instead of the empty state", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [DEMO_LOAN_ROW],
      debtUsd: 1500,
      hideReal: false,
    });

    render(<Loans />);

    expect(screen.getByTestId("active-loans-list")).toBeInTheDocument();
    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("loans-empty-state")).not.toBeInTheDocument();
  });

  it("keeps the empty state when the demo is on but has no loan mocks", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [],
      debtUsd: 0,
      hideReal: false,
    });

    render(<Loans />);

    expect(screen.getByTestId("loans-empty-state")).toBeInTheDocument();
  });
});

describe("Loans page — god-mode summary overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLoanOverrideMock.mockReturnValue(null);
    useHealthFactorOverrideMock.mockReturnValue(null);
    useBorrowCapacityOverrideMock.mockReturnValue(null);
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
  });

  // A forced state must REPLACE the live one: merging them field by field left
  // "Error" rendering the live loader, so the forced state never showed.
  it("shows the forced capacity error even while the live read is loading", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      isBorrowCapacityLoading: true,
    });
    useBorrowCapacityOverrideMock.mockReturnValue({
      loading: false,
      error: new Error("forced"),
    });

    render(<Loans />);

    const summary = screen.getByTestId("loans-summary");
    expect(summary).toHaveAttribute("data-capacity-loading", "false");
    expect(summary).toHaveAttribute("data-capacity-error", "true");
  });

  it("shows the forced loading state even while the live read has failed", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      borrowCapacityError: new Error("live failure"),
    });
    useBorrowCapacityOverrideMock.mockReturnValue({
      loading: true,
      error: null,
    });

    render(<Loans />);

    const summary = screen.getByTestId("loans-summary");
    expect(summary).toHaveAttribute("data-capacity-loading", "true");
    expect(summary).toHaveAttribute("data-capacity-error", "false");
  });

  it("bands the forced health factor with the production rule", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      healthFactor: 5,
      healthFactorStatus: "safe",
    });
    useHealthFactorOverrideMock.mockReturnValue(0.95);

    render(<Loans />);

    const summary = screen.getByTestId("loans-summary");
    expect(summary).toHaveAttribute("data-health-factor", "0.95");
    expect(summary).toHaveAttribute("data-health-factor-status", "danger");
  });

  it("renders the summary from an override alone, with no position and no mocks", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
    });
    useHealthFactorOverrideMock.mockReturnValue(1.25);

    render(<Loans />);

    // The summary only exists in the populated layout, so its presence is what
    // proves the override routed past the full-page empty state. (The inner
    // "no active loans" placeholder still renders below it — there are no rows
    // — and shares the same stub, so it can't be asserted on separately here.)
    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
    expect(screen.queryByTestId("active-loans-list")).not.toBeInTheDocument();
  });
});
