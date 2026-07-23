/**
 * Loans page loading/gating tests.
 *
 * Locks in that a connected depositor whose position is still loading sees a
 * spinner — not the full-page "deposit" empty state — so the deposit CTA can't
 * flash before the summary lands on a hard refresh. Disconnected still shows
 * the connect prompt immediately.
 *
 * Also covers the god-mode demo path: injected mock loans route the page to the
 * populated layout even with no wallet and no position, which is the only way
 * to review the Loans page states.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useDashboardStateMock = vi.fn();
const useDemoLoanMock = vi.fn();

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
    openRepay: vi.fn(),
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

vi.mock("@/dev/demoDeposit", () => ({
  useDemoLoan: () => useDemoLoanMock(),
}));

vi.mock("react-router", () => ({
  useOutletContext: () => ({ openDeposit: vi.fn() }),
}));

vi.mock("@/applications/aave/components/AssetSelectionModal", () => ({
  AssetSelectionModal: () => null,
}));

vi.mock("@/components/shared", () => ({
  EmptyState: ({ isConnected }: { isConnected?: boolean }) => (
    <div
      data-testid="loans-empty-state"
      data-connected={String(Boolean(isConnected))}
    />
  ),
  EmptyStateIcon: () => null,
}));

vi.mock("../../simple/LoansSummary", () => ({
  LoansSummary: () => <div data-testid="loans-summary" />,
}));

vi.mock("../../simple/ActiveLoansList", () => ({
  ActiveLoansList: () => <div data-testid="active-loans-list" />,
}));

import Loans from "../Loans";

const CONNECTED_LOADED = {
  debtValueUsd: 0,
  maxTotalDebtUsd: 0,
  availableToBorrowUsd: 0,
  canBorrow: false,
  healthFactor: 0,
  healthFactorStatus: "safe",
  borrowedAssets: [],
  hasLoans: false,
  hasCollateral: true,
  selectableBorrowedAssets: [],
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
    useDemoLoanMock.mockReturnValue(null);
  });

  it("shows a spinner (not the deposit CTA) while a connected depositor's position loads", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
      isLoading: true,
    });

    const { container } = render(<Loans />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByTestId("loans-empty-state")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("shows the disconnected empty state (no spinner) when disconnected", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
      isLoading: false,
    });

    const { container } = render(<Loans />);

    expect(screen.getByTestId("loans-empty-state")).toHaveAttribute(
      "data-connected",
      "false",
    );
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("renders injected god-mode loans while disconnected, instead of the empty state", () => {
    useConnectionMock.mockReturnValue({ isConnected: false });
    useETHWalletMock.mockReturnValue({ address: undefined });
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
    });
    useDemoLoanMock.mockReturnValue({
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
    useDemoLoanMock.mockReturnValue({ rows: [], debtUsd: 0, hideReal: false });

    render(<Loans />);

    expect(screen.getByTestId("loans-empty-state")).toBeInTheDocument();
  });

  it("renders the summary once a connected depositor with collateral has loaded", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue(CONNECTED_LOADED);

    render(<Loans />);

    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
  });
});
