/**
 * Loans page loading/gating tests.
 *
 * Locks in that a connected depositor whose position is still loading sees a
 * spinner — not the full-page "deposit" empty state — so the deposit CTA can't
 * flash before the summary lands on a hard refresh. Disconnected still shows
 * the connect prompt immediately.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useConnectionMock = vi.fn();
const useETHWalletMock = vi.fn();
const useDashboardStateMock = vi.fn();

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

describe("Loans page — loading gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("renders the summary once a connected depositor with collateral has loaded", () => {
    useConnectionMock.mockReturnValue({ isConnected: true });
    useETHWalletMock.mockReturnValue({ address: "0xabc" });
    useDashboardStateMock.mockReturnValue(CONNECTED_LOADED);

    render(<Loans />);

    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
  });
});
