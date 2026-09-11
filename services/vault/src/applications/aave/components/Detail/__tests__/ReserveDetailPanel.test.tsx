/**
 * Verify the loan form gates. Asset identity must be proven before the form
 * appears. Identity errors must also appear while other requests load.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

import { LOAN_TAB } from "../../../constants";
import { ReserveDetailPanel } from "../ReserveDetailPanel";

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

vi.mock("@/config", () => ({
  FeatureFlags: {},
  getNetworkConfigBTC: () => ({ icon: "btc.png", name: "sBTC" }),
}));

const walletMock = vi.hoisted(() => ({
  btcConnected: true,
  ethConnected: true,
  confirmed: true,
}));
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({ connected: walletMock.confirmed }),
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({
    connected: walletMock.ethConnected,
    address: walletMock.ethConnected ? "0xUser" : undefined,
  }),
}));
vi.mock("@/context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useETHWallet: (await import("@babylonlabs-io/wallet-connector")).useETHWallet,
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

const mockUseAaveReserveDetail = vi.fn();
vi.mock("../hooks", () => ({
  useAaveReserveDetail: () => mockUseAaveReserveDetail(),
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
    currentDebtAmount: 1,
    totalDebtValueUsd: 1,
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

describe("ReserveDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    walletMock.confirmed = true;
    mockUseAaveReserveDetail.mockReturnValue(detailState());
  });

  it("keeps Repay open after a background position refresh fails", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({ positionError: new Error("RPC failed") }),
    );
    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.REPAY}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByTestId("loan-card")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.loans.detail.ancillaryLoadWarning),
    ).toBeVisible();
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

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

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

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

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

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(COPY.loans.detail.identityBlockedTitle),
    ).toBeInTheDocument();
    expect(screen.queryByText(COPY.common.loading)).not.toBeInTheDocument();
  });

  it("prompts to connect before identity loads when both wallets are missing", () => {
    walletMock.btcConnected = false;
    walletMock.ethConnected = false;
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        isLoading: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(COPY.loans.connectToManage.title),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
  });

  it("prompts to connect before identity loads when only Bitcoin is connected", () => {
    walletMock.btcConnected = true;
    walletMock.ethConnected = false;
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        isLoading: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(COPY.loans.connectToManage.title),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
  });

  it("prompts to connect before identity loads when only Ethereum is connected", () => {
    walletMock.btcConnected = false;
    walletMock.ethConnected = true;
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({
        isLoading: true,
        tokenIdentity: null,
        assetConfig: null,
        currentDebtAmount: null,
      }),
    );

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(COPY.loans.connectToManage.title),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
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

    render(
      <ReserveDetailPanel
        reserveId="usdc"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

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

    render(
      <ReserveDetailPanel
        reserveId="99999"
        tab={LOAN_TAB.BORROW}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(COPY.loans.reserveNotFound)).toBeInTheDocument();
  });

  it("blocks Repay after a refresh error when only another reserve has debt", () => {
    mockUseAaveReserveDetail.mockReturnValue(
      detailState({ currentDebtAmount: 0, positionError: new Error("RPC") }),
    );

    render(
      <ReserveDetailPanel
        reserveId="2"
        tab={LOAN_TAB.REPAY}
        onProcessingChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("loan-card")).not.toBeInTheDocument();
    expect(screen.getByText(COPY.loans.detail.positionLoadError)).toBeVisible();
  });
});
