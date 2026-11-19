/**
 * The Repay form must not show an amount validation error while a repayment
 * is in flight: the debt refreshes before the submitted amount clears, so the
 * verdict is stale. The data hooks and the form's sub-components are mocked;
 * the assertion is whether the validation callout body is on screen.
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
import { Repay } from "../index";

const VALIDATION_ERROR = "You cannot repay more than your current debt.";

vi.mock("@babylonlabs-io/core-ui", () => ({
  AmountSlider: () => null,
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
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

vi.mock("@/components/shared/protocolStatus", () => ({
  isRepayBlocked: () => false,
}));

vi.mock("@/context/wallet", () => ({
  useETHWallet: () => ({ address: "0xUser" }),
}));

vi.mock("@/hooks", () => ({
  useERC20Balance: () => ({
    balance: 100,
    error: null,
    hasBalanceData: true,
    refetch: vi.fn(),
  }),
}));

const mocks = vi.hoisted(() => ({
  executeRepay: vi.fn(),
  useRepayTransaction: vi.fn(),
  validateRepayAction: vi.fn(),
}));

vi.mock("../../../../hooks", () => ({
  useDebtReserves: () => [],
  useHubSpokeConfigs: () => ({}),
  useRepayTransaction: mocks.useRepayTransaction,
}));

vi.mock("../../../../utils/hubState", () => ({
  getReserveHubBlock: () => null,
  describeHubBlock: () => null,
}));

vi.mock("../../../AssetPill", () => ({ AssetPill: () => null }));
vi.mock("../../../UnconfirmedTransactionCallout", () => ({
  UnconfirmedTransactionCallout: () => null,
}));
vi.mock("../RepayDetailsCard", () => ({ RepayDetailsCard: () => null }));

vi.mock("../hooks/useRepayState", () => ({
  useRepayState: () => ({
    repayAmount: 5,
    setRepayAmount: vi.fn(),
    setRepayAmountSlider: vi.fn(),
    setRepayAmountMax: vi.fn(),
    resetRepayAmount: vi.fn(),
    maxRepayAmount: 0,
    isMaxIntent: false,
  }),
}));
vi.mock("../hooks/useRepayMetrics", () => ({
  useRepayMetrics: () => ({
    debtCurrent: 0,
    debtProjected: undefined,
    healthFactor: "2.00",
    healthFactorValue: 2,
    healthFactorOriginal: undefined,
  }),
}));
vi.mock("../hooks/validateRepayAction", () => ({
  validateRepayAction: mocks.validateRepayAction,
}));

const VALID_AMOUNT = {
  isDisabled: false,
  buttonText: "Repay",
  errorMessage: null,
  warningMessage: null,
};
const AMOUNT_EXCEEDS_DEBT = {
  isDisabled: true,
  buttonText: "Amount exceeds debt",
  errorMessage: VALIDATION_ERROR,
  warningMessage: null,
};

function makeLoanContext(): LoanContextValue {
  return {
    collateralValueUsd: 15000,
    currentDebtAmount: 0,
    totalDebtValueUsd: 0,
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
  };
}

function repayTransaction(isProcessing: boolean) {
  return {
    executeRepay: mocks.executeRepay,
    isProcessing,
    isConfirming: false,
    pendingWrite: null,
    error: null,
    notice: null,
    clearError: vi.fn(),
  };
}

beforeEach(() => {
  mocks.executeRepay.mockReset();
  mocks.useRepayTransaction.mockReturnValue(repayTransaction(false));
  mocks.validateRepayAction.mockReturnValue(VALID_AMOUNT);
});

describe("Repay", () => {
  it("hides the validation error from the click on Repay until the repay returns", async () => {
    let finishRepay: (result: "failed") => void = () => {};
    mocks.executeRepay.mockReturnValue(
      new Promise((resolve) => {
        finishRepay = resolve;
      }),
    );

    render(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );
    // The refreshed debt makes the submitted amount invalid after the click.
    mocks.validateRepayAction.mockReturnValue(AMOUNT_EXCEEDS_DEBT);
    fireEvent.click(screen.getByTestId("repay-submit-button"));

    await waitFor(() => expect(mocks.executeRepay).toHaveBeenCalled());
    expect(screen.queryByText(VALIDATION_ERROR)).toBeNull();

    finishRepay("failed");

    await waitFor(() =>
      expect(screen.getByText(VALIDATION_ERROR)).toBeTruthy(),
    );
  });

  it("hides the validation error while the repay transaction is processing", () => {
    mocks.useRepayTransaction.mockReturnValue(repayTransaction(true));
    mocks.validateRepayAction.mockReturnValue(AMOUNT_EXCEEDS_DEBT);

    render(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );

    expect(screen.queryByText(VALIDATION_ERROR)).toBeNull();
  });

  it("shows a spinner on the repay button while the repay is processing and none while idle", () => {
    const { rerender } = render(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );
    const button = screen.getByTestId("repay-submit-button");
    expect(within(button).queryByTestId("button-spinner")).toBeNull();

    mocks.useRepayTransaction.mockReturnValue(repayTransaction(true));
    rerender(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );

    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.loans.repay.processing);
  });

  it("shows a spinner on the repay button for a pending write that this form is not processing", () => {
    mocks.useRepayTransaction.mockReturnValue({
      ...repayTransaction(false),
      pendingWrite: { phase: "submitting" },
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );

    const button = screen.getByTestId("repay-submit-button");
    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.loans.repay.processing);
  });

  it("keeps the spinner on the repay button while the repay is confirming", () => {
    mocks.useRepayTransaction.mockReturnValue({
      ...repayTransaction(true),
      isConfirming: true,
    });
    render(
      <LoanProvider value={makeLoanContext()}>
        <Repay />
      </LoanProvider>,
    );

    const button = screen.getByTestId("repay-submit-button");
    expect(within(button).getByTestId("button-spinner")).toBeTruthy();
    expect(button.textContent).toBe(COPY.common.confirming);
  });
});
