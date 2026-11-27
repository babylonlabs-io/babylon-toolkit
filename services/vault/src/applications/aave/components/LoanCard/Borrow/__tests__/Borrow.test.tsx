/**
 * The Borrow form must use the collateral factor under the reserve's current
 * `dynamicConfigKey`: `borrow()` copies that key onto the position before it
 * checks the health factor. The data hooks and the form's sub-components are
 * mocked; the assertion is which threshold and refetch the form hands on.
 *
 * Its Borrow APR row must show what the borrow pays, charges included, and no
 * figure at all rather than the base rate when a charge is unavailable.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import {
  LoanProvider,
  type LoanContextValue,
} from "../../../context/LoanContext";
import { Borrow } from "../index";

vi.mock("@babylonlabs-io/core-ui", () => ({
  AmountSlider: () => <div data-testid="amount-slider" />,
  Button: ({
    children,
    onClick,
    disabled,
    "data-testid": testId,
  }: {
    children: ReactNode;
    onClick: () => void;
    disabled: boolean;
    "data-testid": string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-testid={testId}>
      {children}
    </button>
  ),
  Callout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Heading: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
  Loader: () => <span data-testid="button-spinner" />,
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  WarningIcon: () => null,
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

vi.mock("@/components/shared/protocolStatus", () => ({
  isBorrowBlocked: () => mocks.isBorrowBlocked(),
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xUser" }),
}));

vi.mock("@/applications/aave/utils", () => ({
  getHealthFactorStatusFromValue: () => "safe",
}));

const mocks = vi.hoisted(() => ({
  executeBorrow: vi.fn(),
  clearError: vi.fn(),
  useBorrowTransaction: vi.fn(),
  validateBorrowAction: vi.fn(),
  useBorrowState: vi.fn(),
  useBorrowMetrics: vi.fn(),
  validateBorrowPreSign: vi.fn(),
  useProjectedBorrowApr: vi.fn(),
  useNewBorrowAprCharges: vi.fn(),
  borrowMetricsCard: vi.fn(),
  isBorrowBlocked: vi.fn(),
  hasReachedSafeModeLimit: vi.fn(),
  useAaveReserveDrawHeadroom: vi.fn(),
  useAaveReserveLiquidity: vi.fn(),
}));

vi.mock("../../../../hooks", () => ({
  useAaveReserveDrawHeadroom: mocks.useAaveReserveDrawHeadroom,
  useAaveReserveLiquidity: mocks.useAaveReserveLiquidity,
  useBorrowTransaction: mocks.useBorrowTransaction,
  useDebtReserves: () => [],
  useHubSpokeConfigs: () => ({}),
  useProjectedBorrowApr: mocks.useProjectedBorrowApr,
  useNewBorrowAprCharges: mocks.useNewBorrowAprCharges,
}));

vi.mock("../../../../context", () => ({
  useAaveConfig: () => ({ borrowableReserves: [], chainMaxBorrowReserves: 3 }),
}));

vi.mock("../../../../utils/hubState", () => ({
  getBorrowHubBlock: () => null,
  describeHubBlock: () => null,
}));

vi.mock("../../../AssetPill", () => ({ AssetPill: () => null }));
vi.mock("../BorrowMetricsCard", () => ({
  BorrowMetricsCard: (props: {
    safeMode: boolean;
    safeModeDisabled?: boolean;
    onSafeModeChange: (enabled: boolean) => void;
  }) => {
    mocks.borrowMetricsCard(props);
    return (
      <div data-testid="borrow-metrics-card">
        <button
          aria-label={COPY.loans.borrow.safeMode}
          aria-pressed={props.safeMode}
          disabled={props.safeModeDisabled}
          onClick={() => props.onSafeModeChange(!props.safeMode)}
        />
      </div>
    );
  },
}));
vi.mock("../LiquidationPreview", () => ({ LiquidationPreview: () => null }));

vi.mock("../hooks/useBorrowState", () => ({
  useBorrowState: mocks.useBorrowState,
}));
vi.mock("../hooks/useBorrowMetrics", () => ({
  useBorrowMetrics: mocks.useBorrowMetrics,
}));
vi.mock("../hooks/validateBorrowAction", () => ({
  getBorrowLimit: (max: number) => ({ max, limitedBy: "collateral" }),
  hasReachedSafeModeLimit: mocks.hasReachedSafeModeLimit,
  validateBorrowAction: mocks.validateBorrowAction,
}));
vi.mock("../hooks/validateBorrowPreSign", () => ({
  validateBorrowPreSign: mocks.validateBorrowPreSign,
}));

function makeLoanContext(
  overrides: Partial<LoanContextValue> = {},
): LoanContextValue {
  return {
    collateralValueUsd: 15000,
    currentDebtAmount: 0,
    totalDebtValueUsd: 1000,
    healthFactor: 3,
    liquidationThresholdBps: 8000,
    borrowLiquidationThresholdBps: 6000,
    selectedReserve: {
      reserveId: 2n,
      reserve: { underlying: "0xUSDC", hub: "0xHub" },
    } as unknown as LoanContextValue["selectedReserve"],
    tokenIdentity: {
      address: "0xUSDC" as Address,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      icon: undefined,
      source: "registry",
    } as LoanContextValue["tokenIdentity"],
    assetConfig: { symbol: "USDC", name: "USD Coin", icon: "icon.png" },
    hub: { label: "Core Hub" } as LoanContextValue["hub"],
    proxyContract: "0xProxy",
    oracleAddress: "0xOracle" as Address,
    tokenPriceUsd: 1,
    isPriceStale: false,
    isPositionDataStale: false,
    refetchPosition: vi.fn(),
    refetchSplitParams: vi.fn(),
    refetchBorrowSplitParams: vi.fn(),
    onBorrowSuccess: vi.fn(),
    onRepaySuccess: vi.fn(),
    onProcessingChange: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.isBorrowBlocked.mockReturnValue(false);
  mocks.hasReachedSafeModeLimit.mockReturnValue(false);
  mocks.useAaveReserveDrawHeadroom.mockReturnValue({ headroomByReserveId: {} });
  mocks.useAaveReserveLiquidity.mockReturnValue({ liquidityByReserveId: {} });
  mocks.useBorrowTransaction.mockReturnValue({
    executeBorrow: mocks.executeBorrow,
    isProcessing: false,
    isConfirming: false,
    pendingWrite: null,
    error: null,
    notice: null,
    clearError: mocks.clearError,
  });
  mocks.validateBorrowAction.mockReturnValue({
    isDisabled: false,
    buttonText: "Borrow",
    errorMessage: null,
  });
  mocks.useBorrowState.mockReturnValue({
    borrowAmount: 10,
    setBorrowAmount: vi.fn(),
    resetBorrowAmount: vi.fn(),
    maxBorrowAmount: 100,
    safeModeOffMaxBorrowAmount: 105,
  });
  mocks.useBorrowMetrics.mockReturnValue({
    healthFactor: "2.00",
    healthFactorValue: 2,
    healthFactorOriginal: null,
  });
  mocks.useProjectedBorrowApr.mockReturnValue({
    currentPercent: 4,
    projectedPercent: 5,
  });
  mocks.useNewBorrowAprCharges.mockReturnValue({
    premiumFraction: 0.1,
    interestFeeBps: 300,
  });
});

describe("Borrow", () => {
  it("prices and pre-sign checks the borrow under the reserve's current key", async () => {
    mocks.executeBorrow.mockImplementation(
      async (
        _amount: number,
        _reserve: unknown,
        preSign: (raw: bigint, decimals: number) => unknown,
      ) => {
        // On-chain decimals (8) differ from the indexer's token decimals (6).
        await preSign(10_000_000_000n, 8);
        return false;
      },
    );
    const refetchBorrowSplitParams = vi.fn();

    render(
      <LoanProvider value={makeLoanContext({ refetchBorrowSplitParams })}>
        <Borrow />
      </LoanProvider>,
    );
    fireEvent.click(screen.getByTestId("borrow-submit-button"));

    expect(mocks.useBorrowState).toHaveBeenCalledWith(
      expect.objectContaining({
        liquidationThresholdBps: 6000,
        safeMode: true,
      }),
    );
    expect(mocks.useBorrowMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ liquidationThresholdBps: 6000 }),
    );
    await waitFor(() =>
      expect(mocks.validateBorrowPreSign).toHaveBeenCalledWith(
        expect.objectContaining({
          borrowAmountRaw: 10_000_000_000n,
          tokenDecimals: 8,
          liquidationThresholdBps: 6000,
          safeMode: true,
          refetchSplitParams: refetchBorrowSplitParams,
        }),
      ),
    );
  });

  it("shows the warning and passes Safe mode off to both checks", async () => {
    mocks.executeBorrow.mockImplementation(
      async (
        _amount: number,
        _reserve: unknown,
        preSign: (raw: bigint, decimals: number) => unknown,
      ) => {
        await preSign(10_000_000n, 6);
        return "failed";
      },
    );
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Safe mode" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.validateBorrowAction).toHaveBeenLastCalledWith(
      10,
      2,
      100,
      6,
      "USDC",
      "Core Hub",
      false,
      "collateral",
      true,
    );
    mocks.clearError.mockClear();
    fireEvent.click(toggle);
    expect(mocks.clearError).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(
      COPY.loans.borrow.safeModeOffWarning,
    );
    expect(mocks.useBorrowState).toHaveBeenLastCalledWith(
      expect.objectContaining({ safeMode: false }),
    );
    expect(mocks.validateBorrowAction).toHaveBeenLastCalledWith(
      10,
      2,
      100,
      6,
      "USDC",
      "Core Hub",
      false,
      "collateral",
      false,
    );

    fireEvent.click(screen.getByTestId("borrow-submit-button"));
    await waitFor(() =>
      expect(mocks.validateBorrowPreSign).toHaveBeenLastCalledWith(
        expect.objectContaining({ safeMode: false }),
      ),
    );

    fireEvent.click(toggle);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the Safe mode toggle in the metrics card below the amount slider and warning", () => {
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    const slider = screen.getByTestId("amount-slider");
    const toggle = screen.getByRole("button", { name: "Safe mode" });
    expect(
      slider.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(toggle);
    const warning = screen.getByRole("alert");
    expect(
      slider.compareDocumentPosition(warning) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      warning.compareDocumentPosition(toggle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("locks the Safe mode toggle while a borrow is processing", () => {
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: true,
      isConfirming: false,
      pendingWrite: null,
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen
        .getByRole("button", { name: "Safe mode" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("locks the Safe mode toggle while another Aave write is pending", () => {
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: false,
      isConfirming: false,
      pendingWrite: { phase: "submitting" },
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen
        .getByRole("button", { name: "Safe mode" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("checks the Safe mode limit with the form's Safe mode and limits", () => {
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 0,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
    });
    mocks.useAaveReserveLiquidity.mockReturnValue({
      liquidityByReserveId: {
        "2": { availableLiquidity: 1000, utilizationBps: 5000 },
      },
    });
    mocks.useAaveReserveDrawHeadroom.mockReturnValue({
      headroomByReserveId: { "2": 500 },
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    // Both caps keep the form's 0.1% margin below the hub's figures.
    expect(mocks.hasReachedSafeModeLimit).toHaveBeenLastCalledWith({
      safeMode: true,
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
      liquidityCap: expect.closeTo(999),
      borrowLimitCap: expect.closeTo(499.5),
      tokenDecimals: 6,
      tokenPriceUsd: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "Safe mode" }));
    expect(mocks.hasReachedSafeModeLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ safeMode: false }),
    );
  });

  it("checks the Safe mode limit with no price while the price is stale", () => {
    render(
      <LoanProvider value={makeLoanContext({ isPriceStale: true })}>
        <Borrow />
      </LoanProvider>,
    );

    expect(mocks.hasReachedSafeModeLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({ tokenPriceUsd: null }),
    );
  });

  it("does not show the Safe mode limit message while the limit is not reached", () => {
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.queryByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeNull();
  });

  it("shows the Safe mode limit message in place of a stale transaction error", () => {
    mocks.hasReachedSafeModeLimit.mockReturnValue(true);
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 10,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
    });
    mocks.validateBorrowAction.mockReturnValue({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 0 USDC on Core Hub. Enter a lower amount and try again.",
    });
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: false,
      isConfirming: false,
      pendingWrite: null,
      error: "Borrow failed: Position data has changed.",
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.getByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeTruthy();
    expect(
      screen.queryByText("Borrow failed: Position data has changed."),
    ).toBeNull();
  });

  it("shows the Safe mode limit message in place of a max-amount error", () => {
    mocks.hasReachedSafeModeLimit.mockReturnValue(true);
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 10,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
    });
    mocks.validateBorrowAction.mockReturnValue({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 0 USDC on Core Hub. Enter a lower amount and try again.",
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.getByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "The maximum borrowable amount is 0 USDC on Core Hub. Enter a lower amount and try again.",
      ),
    ).toBeNull();
  });

  it("keeps the max-amount error while the Safe mode limit is not reached", () => {
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 150,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 100,
      safeModeOffMaxBorrowAmount: 105,
    });
    mocks.validateBorrowAction.mockReturnValue({
      isDisabled: true,
      buttonText: "Amount exceeds maximum",
      errorMessage:
        "The maximum borrowable amount is 100 USDC on Core Hub. Enter a lower amount and try again.",
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.getByText(
        "The maximum borrowable amount is 100 USDC on Core Hub. Enter a lower amount and try again.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeNull();
  });

  it("keeps the minimum-amount error at the Safe mode limit", () => {
    mocks.hasReachedSafeModeLimit.mockReturnValue(true);
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 0.0000001,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
    });
    mocks.validateBorrowAction.mockReturnValue({
      isDisabled: true,
      buttonText: "Amount too small",
      errorMessage:
        "The minimum borrowable amount is 0.000001. Enter a higher amount and try again.",
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.getByText(
        "The minimum borrowable amount is 0.000001. Enter a higher amount and try again.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeNull();
  });

  it("shows the Safe mode limit message before an amount is entered", () => {
    mocks.hasReachedSafeModeLimit.mockReturnValue(true);
    mocks.useBorrowState.mockReturnValue({
      borrowAmount: 0,
      setBorrowAmount: vi.fn(),
      resetBorrowAmount: vi.fn(),
      maxBorrowAmount: 0,
      safeModeOffMaxBorrowAmount: 50,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.getByText(COPY.loans.borrow.safeModeLimitReached),
    ).toBeTruthy();
  });

  it("hides the validation error while the borrow is processing", () => {
    mocks.validateBorrowAction.mockReturnValue({
      isDisabled: true,
      buttonText: "Amount exceeds limit",
      errorMessage: "You cannot borrow more than your limit.",
    });
    const loanContext = makeLoanContext();

    const { rerender } = render(
      <LoanProvider value={loanContext}>
        <Borrow />
      </LoanProvider>,
    );
    expect(
      screen.getByText("You cannot borrow more than your limit."),
    ).toBeTruthy();

    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: true,
      isConfirming: false,
      pendingWrite: null,
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    rerender(
      <LoanProvider value={loanContext}>
        <Borrow />
      </LoanProvider>,
    );

    expect(
      screen.queryByText("You cannot borrow more than your limit."),
    ).toBeNull();
  });

  it("shows a spinner on the borrow button while the borrow is processing and none while idle", () => {
    const loanContext = makeLoanContext();
    const { rerender } = render(
      <LoanProvider value={loanContext}>
        <Borrow />
      </LoanProvider>,
    );
    const button = screen.getByTestId("borrow-submit-button");
    expect(within(button).queryByTestId("button-spinner")).toBeNull();

    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: true,
      isConfirming: false,
      pendingWrite: null,
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    rerender(
      <LoanProvider value={loanContext}>
        <Borrow />
      </LoanProvider>,
    );

    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.loans.borrow.processing);
  });

  it("keeps the spinner on the borrow button while the borrow is confirming", () => {
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: true,
      isConfirming: true,
      pendingWrite: null,
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    const button = screen.getByTestId("borrow-submit-button");
    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.common.confirming);
  });

  it("shows a spinner on the borrow button for a pending write that this form is not processing", () => {
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: false,
      isConfirming: false,
      pendingWrite: { phase: "submitting" },
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    const button = screen.getByTestId("borrow-submit-button");
    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.loans.borrow.processing);
  });

  it("shows no spinner on an unavailable borrow button while a transaction is in flight", () => {
    mocks.isBorrowBlocked.mockReturnValue(true);
    mocks.useBorrowTransaction.mockReturnValue({
      executeBorrow: mocks.executeBorrow,
      isProcessing: true,
      isConfirming: false,
      pendingWrite: null,
      error: null,
      notice: null,
      clearError: mocks.clearError,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    const button = screen.getByTestId("borrow-submit-button");
    expect(within(button).queryByTestId("button-spinner")).toBeNull();
    expect(button.textContent).toBe(COPY.loans.borrow.unavailable);
  });

  it("shows current and projected Borrow APR with the premium and fee included", () => {
    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(mocks.borrowMetricsCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        borrowApr: "4.52%",
        borrowAprProjected: "5.65%",
      }),
    );
  });

  it("shows the empty value instead of the base rate when the premium is unavailable", () => {
    mocks.useNewBorrowAprCharges.mockReturnValue({
      premiumFraction: null,
      interestFeeBps: 300,
    });

    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(mocks.borrowMetricsCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        borrowApr: COPY.common.emptyValue,
        borrowAprProjected: undefined,
      }),
    );
  });

  it("shows the empty value instead of the base rate when the interest fee is unavailable", () => {
    mocks.useNewBorrowAprCharges.mockReturnValue({
      premiumFraction: 0.1,
      interestFeeBps: null,
    });

    render(
      <LoanProvider value={makeLoanContext()}>
        <Borrow />
      </LoanProvider>,
    );

    expect(mocks.borrowMetricsCard).toHaveBeenLastCalledWith(
      expect.objectContaining({
        borrowApr: COPY.common.emptyValue,
        borrowAprProjected: undefined,
      }),
    );
  });
});
