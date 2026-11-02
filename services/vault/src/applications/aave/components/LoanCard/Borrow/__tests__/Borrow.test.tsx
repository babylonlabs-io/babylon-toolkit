/**
 * The Borrow form must use the collateral factor under the reserve's current
 * `dynamicConfigKey`: `borrow()` copies that key onto the position before it
 * checks the health factor. The data hooks and the form's sub-components are
 * mocked; the assertion is which threshold and refetch the form hands on.
 *
 * Its Borrow APR row must show what the borrow pays, charges included, and no
 * figure at all rather than the base rate when a charge is unavailable.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  SubSection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  WarningIcon: () => null,
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => ({ protocol: null, aave: null }),
}));

vi.mock("@/components/shared/protocolStatus", () => ({
  isBorrowBlocked: () => false,
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
  useBorrowState: vi.fn(),
  useBorrowMetrics: vi.fn(),
  validateBorrowPreSign: vi.fn(),
  useProjectedBorrowApr: vi.fn(),
  useNewBorrowAprCharges: vi.fn(),
  borrowMetricsCard: vi.fn(),
}));

vi.mock("../../../../hooks", () => ({
  useAaveReserveDrawHeadroom: () => ({ headroomByReserveId: {} }),
  useAaveReserveLiquidity: () => ({ liquidityByReserveId: {} }),
  useBorrowTransaction: () => ({
    executeBorrow: mocks.executeBorrow,
    isProcessing: false,
    isConfirming: false,
    pendingWrite: null,
    error: null,
    notice: null,
    clearError: mocks.clearError,
  }),
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
  BorrowMetricsCard: (props: unknown) => {
    mocks.borrowMetricsCard(props);
    return null;
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
  validateBorrowAction: () => ({
    isDisabled: false,
    buttonText: "Borrow",
    errorMessage: null,
  }),
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
  mocks.useBorrowState.mockReturnValue({
    borrowAmount: 10,
    setBorrowAmount: vi.fn(),
    resetBorrowAmount: vi.fn(),
    maxBorrowAmount: 100,
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
      async (_amount: number, _reserve: unknown, preSign: () => unknown) => {
        await preSign();
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
      expect.objectContaining({ liquidationThresholdBps: 6000 }),
    );
    expect(mocks.useBorrowMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ liquidationThresholdBps: 6000 }),
    );
    await waitFor(() =>
      expect(mocks.validateBorrowPreSign).toHaveBeenCalledWith(
        expect.objectContaining({
          liquidationThresholdBps: 6000,
          refetchSplitParams: refetchBorrowSplitParams,
        }),
      ),
    );
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
