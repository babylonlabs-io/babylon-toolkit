/**
 * AaveReserveDetail — branch order of the reserve-detail overlay.
 *
 * The ordering is load-bearing, not cosmetic: nothing derived from the reserve
 * may reach the DOM before its asset is proven on-chain (audit F7). In
 * particular the identity block must win over the loading spinner, since
 * `isLoading` ORs four sources and a still-pending price query would otherwise
 * hide a resolved integrity failure.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { AaveReserveDetail } from "..";
import { LOAN_TAB } from "../../../constants";

vi.mock("@babylonlabs-io/core-ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  Text: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/shared", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/shared/V3ModalShell", () => ({
  V3ModalShell: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/config", () => ({
  FeatureFlags: { isV3UiEnabled: true },
  getNetworkConfigBTC: () => ({ icon: "btc.png", name: "sBTC" }),
}));

const mockUseConnection = vi.fn(() => ({ isConnected: true }));
vi.mock("@/context/wallet", () => ({
  useConnection: () => mockUseConnection(),
  useETHWallet: () => ({ address: "0xUser" }),
}));

vi.mock("../../../context", () => ({
  useAaveConfig: () => ({ config: { coreSpokeAddress: "0xSpoke" } }),
}));

vi.mock("../../../hooks", () => ({
  useAaveOracleAddress: () => ({ oracleAddress: "0xOracle" }),
}));

// The borrow/repay form itself is out of scope here; its presence is the
// assertion that the overlay reached the proven branch.
vi.mock("../../LoanCard", () => ({
  LoanCard: () => <div data-testid="loan-card" />,
}));

vi.mock("../../LoanCard/LoanSuccessModal", () => ({
  LoanSuccessModal: () => null,
}));

const mockUseAaveReserveDetail = vi.fn();
vi.mock("../hooks", () => ({
  useAaveReserveDetail: () => mockUseAaveReserveDetail(),
  useBorrowRepayModals: () => ({
    showBorrowSuccess: false,
    borrowSuccessData: { amount: 0 },
    openBorrowSuccess: vi.fn(),
    closeBorrowSuccess: vi.fn(),
    showRepaySuccess: false,
    repaySuccessData: { repayAmount: 0, withdrawAmount: 0 },
    openRepaySuccess: vi.fn(),
    closeRepaySuccess: vi.fn(),
  }),
}));

const RESERVE = {
  reserveId: 2n,
  reserve: { collateralFactor: 0, underlying: "0xUSDC" as Address },
  token: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    address: "0xUSDC" as Address,
  },
};

const IDENTITY = {
  address: "0xUSDC" as Address,
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  icon: undefined,
  source: "registry" as const,
};

function detailState(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    selectedReserve: RESERVE,
    tokenIdentity: IDENTITY,
    assetConfig: { symbol: "USDC", name: "USD Coin", icon: "icon.png" },
    vbtcReserve: { reserveId: 1n },
    liquidationThresholdBps: 7500,
    proxyContract: "0xProxy",
    collateralValueUsd: 15000,
    currentDebtAmount: 0,
    totalDebtValueUsd: 0,
    healthFactor: null,
    tokenPriceUsd: 1,
    isPriceStale: false,
    positionError: null,
    ancillaryError: null,
    identityError: null,
    isIdentityCompromised: false,
    retryIdentity: vi.fn(),
    isLegacyReserveParam: false,
    isPositionDataStale: false,
    refetchPosition: vi.fn(),
    refetchSplitParams: vi.fn(),
    ...overrides,
  };
}

describe("AaveReserveDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConnection.mockReturnValue({ isConnected: true });
    mockUseAaveReserveDetail.mockReturnValue(detailState());
  });

  it("renders the loan form once the reserve's identity is proven", () => {
    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(screen.getByTestId("loan-card")).toBeInTheDocument();
  });

  it("blocks with integrity copy and no retry when the asset can't be verified", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        identityError: new Error("reserve maps to a different token"),
        isIdentityCompromised: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.identityBlockedTitle),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.loans.detail.retry }),
    ).not.toBeInTheDocument();
  });

  it("blocks with retryable copy when verification couldn't complete", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        identityError: new Error("rpc connection lost"),
        isIdentityCompromised: false,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.identityUnavailableTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: COPY.loans.detail.retry }),
    ).toBeInTheDocument();
  });

  it("shows the identity block rather than the spinner while other sources still load", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        isLoading: true,
        identityError: new Error("reserve maps to a different token"),
        isIdentityCompromised: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.identityBlockedTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.loans.detail.loading),
    ).not.toBeInTheDocument();
  });

  it("prompts to connect without waiting on the identity round-trip", () => {
    mockUseConnection.mockReturnValue({ isConnected: false });
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        isLoading: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.connectTitle),
    ).toBeInTheDocument();
  });

  it("tells the user a legacy symbol link is outdated", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        selectedReserve: null,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
        isLegacyReserveParam: true,
      }),
    );

    render(<AaveReserveDetail reserveId="usdc" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.reserveLinkOutdated),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
  });

  it("reports an unresolvable reserve id as not found", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        selectedReserve: null,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(<AaveReserveDetail reserveId="99999" tab={LOAN_TAB.BORROW} />);

    expect(
      screen.getByText(COPY.loans.detail.reserveNotFound),
    ).toBeInTheDocument();
  });

  it("withholds the loan form while the debt figure is still unproven", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({ currentDebtAmount: null }),
    );

    render(<AaveReserveDetail reserveId="2" tab={LOAN_TAB.BORROW} />);

    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.detail.reserveNotFound),
    ).toBeInTheDocument();
  });
});
