/**
 * Loans page states and Repay access, including missing collateral details.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

const walletMock = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
  address: "0xabc" as string | undefined,
}));
const useDashboardStateMock = vi.fn();
const useLoanOverrideMock = vi.fn();
const useHealthFactorOverrideMock = vi.fn();
const useBorrowCapacityOverrideMock = vi.fn();
const openRepayMock = vi.fn();

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({ connected: walletMock.confirmed }),
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({
    connected: walletMock.ethConnected,
    address: walletMock.address,
  }),
}));

// The real gate, so the Ethereum-only control decides what this page counts as
// connected. A hand-supplied `isConnected` would pass with the control removed.
vi.mock("@/context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useETHWallet: (await import("@babylonlabs-io/wallet-connector")).useETHWallet,
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: (address: unknown) => useDashboardStateMock(address),
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

vi.mock("@/overrides/loans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/overrides/loans")>()),
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
    description,
  }: {
    isConnected?: boolean;
    title?: string;
    description?: ReactNode;
  }) => (
    <div
      data-testid="loans-empty-state"
      data-connected={String(Boolean(isConnected))}
    >
      {title}
      {/* The description states what the borrow cap means for this position.
          Dropping it here would leave that copy untestable from this page. */}
      <div data-testid="loans-empty-state-description">{description}</div>
    </div>
  ),
}));

// One cap for the mock and every assertion derived from it: a change here
// must move the asserted copy branch with it, not silently compare the wrong one.
// Not 1: a cap hard-coded to 1 in the page would pass at a mocked cap of 1.
const MOCK_CAP = 2;

vi.mock("@/applications/aave/context", () => ({
  useAaveConfig: () => ({
    maxBorrowReserves: { status: "loaded", limit: MOCK_CAP },
  }),
}));

vi.mock("../../simple/LoansSummary", () => ({
  LoansSummary: ({
    borrowCapacityLoading,
    borrowCapacityError,
    healthFactor,
    healthFactorStatus,
    borrowedAssets,
    borrowCount,
    canRepay,
    onRepay,
  }: {
    borrowCapacityLoading: boolean;
    borrowCapacityError: Error | null;
    healthFactor: number | null;
    healthFactorStatus: string;
    borrowedAssets: { symbol: string }[];
    borrowCount: bigint | null;
    canRepay: boolean;
    onRepay: () => void;
  }) => (
    <div
      data-testid="loans-summary"
      data-capacity-loading={String(borrowCapacityLoading)}
      data-capacity-error={String(Boolean(borrowCapacityError))}
      data-health-factor={String(healthFactor)}
      data-health-factor-status={healthFactorStatus}
      data-borrowed-assets={borrowedAssets.map((a) => a.symbol).join(",")}
      data-borrow-count={String(borrowCount)}
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
  // `accountData` is required on AavePositionWithLiveData, and the Borrowed
  // Asset card reads its `borrowCount` — the Spoke's own borrow-reserve
  // counter — without an optional chain.
  position: {
    collaterals: [],
    vaultIds: [],
    accountData: { borrowCount: 0n },
  },
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
  hub: {
    source: "registry" as const,
    address: "0xb3283508a0E96F80CF79DC2a1135F10dA170138D" as const,
    label: "Babylon Hub",
  },
  amount: "1500",
  icon: "",
  borrowRate: "5.861%",
  availableLiquidity: 1_250_000,
  utilizationBps: 6420,
  isBorrowable: true,
  displayOnly: true,
};

// The Ethereum-only control is read from the environment by the real
// `featureFlags` getter. Pin it, or a run takes whatever the developer's
// environment carries; unstub it, or the value reaches every later file.
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Loans page — loading gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    walletMock.confirmed = true;
    walletMock.address = "0xabc";
    useLoanOverrideMock.mockReturnValue(null);
    useHealthFactorOverrideMock.mockReturnValue(null);
    useBorrowCapacityOverrideMock.mockReturnValue(null);
  });

  it("shows the connect prompt while disconnected", () => {
    walletMock.ethConnected = false;
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
    });
    const { container } = render(<Loans />);
    expect(screen.getByText(COPY.loans.emptyDisconnected)).toBeInTheDocument();
    expect(screen.getByTestId("loans-empty-state")).toHaveAttribute(
      "data-connected",
      "false",
    );
    expect(useDashboardStateMock).toHaveBeenCalledWith(undefined);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("shows the connect prompt for Ethereum alone while Ethereum-only access is off", () => {
    walletMock.btcConnected = false;
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasLoans: true,
      debtValueUsd: 1500,
    });

    render(<Loans />);

    expect(screen.getByText(COPY.loans.emptyDisconnected)).toBeInTheDocument();
    expect(useDashboardStateMock).toHaveBeenCalledWith(undefined);
    expect(screen.queryByTestId("loans-summary")).not.toBeInTheDocument();
  });

  it("opens the loans summary for Ethereum alone under Ethereum-only access", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    walletMock.btcConnected = false;
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasLoans: true,
      debtValueUsd: 1500,
    });

    render(<Loans />);

    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
    expect(useDashboardStateMock).toHaveBeenCalledWith("0xabc");
    expect(
      screen.queryByText(COPY.loans.emptyDisconnected),
    ).not.toBeInTheDocument();
  });

  it("shows a loader before the first position read finishes", () => {
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
    useDashboardStateMock.mockReturnValue(CONNECTED_LOADED);
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.noActiveLoans.title),
    ).toBeInTheDocument();
    // The body, not just the title: it states what the cap means for this
    // position, and the mocked cap is what selects the wording. Read as
    // one string because the design emphasises the middle clause in its own
    // element, so the sentence spans several nodes.
    const body = COPY.loans.noActiveLoans.body(MOCK_CAP);
    expect(
      screen.getByTestId("loans-empty-state-description"),
    ).toHaveTextContent(`${body.lead}${body.emphasis}${body.rest}`);
    expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  });

  it("keeps Repay available when indexed collateral details are missing", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
      hasLoans: true,
      debtValueUsd: 1500,
      borrowedAssets: [DEMO_LOAN_ROW],
      position: {
        collaterals: [],
        vaultIds: [],
        accountData: { borrowCount: 1n },
      },
      indexerError: new Error("Indexer unavailable"),
    });
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrowed-assets",
      "USDC",
    );
    expect(
      screen.getByText(COPY.loans.detail.ancillaryLoadWarning),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repay" }));
    expect(openRepayMock).toHaveBeenCalledOnce();
  });

  it("shows the deposit prompt after the chain confirms no position", () => {
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
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasLoans: true,
      debtValueUsd: 1500,
      borrowedAssets: [DEMO_LOAN_ROW],
      position: {
        collaterals: [],
        vaultIds: [],
        accountData: { borrowCount: 1n },
      },
      positionError: new Error("RPC unavailable"),
    });
    render(<Loans />);
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrowed-assets",
      "USDC",
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
    walletMock.ethConnected = false;
    walletMock.address = undefined;
    // Production-shaped: the position query is disabled while disconnected,
    // so it reads null, not a loaded position.
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [DEMO_LOAN_ROW],
      hideReal: false,
    });

    render(<Loans />);

    expect(screen.getByTestId("active-loans-list")).toBeInTheDocument();
    // The mock row's reserve on top of a real count of 0: a disconnected
    // visitor owes nothing, which is a count, not an unknown one.
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrow-count",
      "1",
    );
    expect(screen.queryByTestId("loans-empty-state")).not.toBeInTheDocument();
  });

  it("adds the demo's reserves to the real borrow count, not in place of it", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasLoans: true,
      debtValueUsd: 1500,
      position: {
        collaterals: [],
        vaultIds: [],
        accountData: { borrowCount: 1n },
      },
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [DEMO_LOAN_ROW],
      hideReal: false,
    });

    render(<Loans />);

    // One real reserve plus one mock reserve. Replacing the real count with
    // the demo's would read 1 and understate how close the account is to the
    // cap.
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrow-count",
      "2",
    );
  });

  it("shows the demo's borrow count as unknown while the real position is still loading", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
      hasCollateral: false,
      isLoading: true,
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [DEMO_LOAN_ROW],
      hideReal: false,
    });

    render(<Loans />);

    // The demo adds to the real count, and the real count has not arrived:
    // showing the demo's 1 alone would understate it.
    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrow-count",
      "null",
    );
  });

  it("counts zero borrows for a connected position that loaded as null", () => {
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      position: null,
    });

    render(<Loans />);

    expect(screen.getByTestId("loans-summary")).toHaveAttribute(
      "data-borrow-count",
      "0",
    );
  });

  it("keeps the empty state when the demo is on but has no loan mocks", () => {
    walletMock.ethConnected = false;
    walletMock.address = undefined;
    useDashboardStateMock.mockReturnValue({
      ...CONNECTED_LOADED,
      hasCollateral: false,
    });
    useLoanOverrideMock.mockReturnValue({
      rows: [],
      hideReal: false,
    });

    render(<Loans />);

    expect(screen.getByTestId("loans-empty-state")).toBeInTheDocument();
  });
});

describe("Loans page — god-mode summary overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    walletMock.confirmed = true;
    walletMock.address = "0xabc";
    useLoanOverrideMock.mockReturnValue(null);
    useHealthFactorOverrideMock.mockReturnValue(null);
    useBorrowCapacityOverrideMock.mockReturnValue(null);
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
    walletMock.ethConnected = false;
    walletMock.address = undefined;
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
