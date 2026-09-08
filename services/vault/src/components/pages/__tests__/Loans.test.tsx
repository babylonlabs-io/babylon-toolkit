/**
 * Loans page states and Repay access, including missing collateral details.
 */

import { fireEvent, render, screen } from "@testing-library/react";
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

  it.each<[string, boolean, boolean, boolean, boolean, Error | null]>([
    ["empty", false, false, false, false, null],
    ["loading", true, true, false, false, null],
    ["summary", true, false, true, false, null],
    ["summary", true, false, false, true, null],
    ["empty", true, false, false, false, null],
    ["error", true, false, false, false, new Error("RPC unavailable")],
  ])(
    "renders %s (connected %s, loading %s, collateral %s, debt %s)",
    (view, connected, loading, collateral, debt, error) => {
      useConnectionMock.mockReturnValue({ isConnected: connected });
      useETHWalletMock.mockReturnValue({
        address: connected ? "0xabc" : undefined,
      });
      useDashboardStateMock.mockReturnValue({
        ...CONNECTED_LOADED,
        hasCollateral: collateral,
        hasLoans: debt,
        debtValueUsd: debt ? 1500 : 0,
        isLoading: loading,
        positionError: error,
      });

      const { container } = render(<Loans />);
      expect(Boolean(container.querySelector("svg"))).toBe(view === "loading");
      expect(Boolean(screen.queryByTestId("loans-empty-state"))).toBe(
        view === "empty" || (view === "summary" && !debt),
      );
      expect(Boolean(screen.queryByTestId("loans-summary"))).toBe(
        view === "summary",
      );
      expect(
        Boolean(screen.queryByText(COPY.loans.detail.positionLoadError)),
      ).toBe(view === "error");
      if (!connected)
        expect(
          screen.getByText(COPY.loans.emptyDisconnected),
        ).toBeInTheDocument();
      if (debt) {
        expect(screen.getByTestId("loans-summary")).toHaveAttribute(
          "data-total-borrowed",
          "$1,500.00 USD",
        );
        fireEvent.click(screen.getByRole("button", { name: "Repay" }));
        expect(openRepayMock).toHaveBeenCalledOnce();
      }
    },
  );

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
