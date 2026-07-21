import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import VaultsPage from "@/components/pages/VaultsPage";
import { COPY } from "@/copy";

// The deposits kill-switch is read through two module paths: VaultsPage
// swaps copy via `FeatureFlags` (@/config) and isDepositBlocked reads the
// default export of @/config/featureFlags. Point both at one mutable mock.
const featureFlagsMock = vi.hoisted(() => ({
  isDepositDisabled: false,
  isProtocolPaused: false,
  isProtocolFrozen: false,
}));

vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
}));

vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

const emptinessState = vi.hoisted(() => ({
  isLoading: false,
  isEmpty: true,
  hasError: false,
  hasPartialError: false,
}));

vi.mock("@/hooks/useVaultsPageEmptiness", () => ({
  useVaultsPageEmptiness: () => emptinessState,
}));

const walletState = vi.hoisted(() => ({ isConnected: true }));

vi.mock("@/context/wallet", () => ({
  useConnection: () => ({ isConnected: walletState.isConnected }),
  useETHWallet: () => ({
    address: "0x1111111111111111111111111111111111111111",
  }),
}));

// Page-level data is exercised in the hook's own tests; the page test only
// checks which body branch renders, so the sections are stubbed.
vi.mock("@/hooks/useVaultsPageData", () => ({
  useVaultsPageData: () => ({
    summary: {
      totalCollateralBtc: "0 sBTC",
      totalCollateralUsd: "$0 USD",
      activeVaultsCount: 0,
      liquidationOrder: null,
      healthFactor: null,
      healthFactorStatus: "no_debt",
    },
    displayVaults: [],
    rawCollateralVaults: [],
    collateralBtc: 0,
    collateralValueUsd: 0,
    isLoading: false,
  }),
}));

vi.mock("@/dev/demoDeposit", () => ({
  useDemoDeposit: () => null,
}));

vi.mock("@/components/vaults/VaultsSummaryCard", () => ({
  VaultsSummaryCard: () => <div data-testid="vaults-summary-card" />,
}));

vi.mock("@/components/vaults/VaultsLifecycleSections", () => ({
  VaultsLifecycleSections: ({ children }: { children?: ReactNode }) => (
    <div data-testid="vaults-lifecycle-sections">{children}</div>
  ),
}));

vi.mock("@/components/vaults/VaultsActiveSection", () => ({
  VaultsActiveSection: () => <div data-testid="vaults-active-section" />,
}));

vi.mock("@/components/simple/WithdrawFlow", () => ({
  default: () => null,
}));

vi.mock("@/components/simple/ReorderVaults", () => ({
  ReorderVaultsModal: () => null,
  ReorderSuccessModal: () => null,
}));

const gateState = vi.hoisted(() => ({
  protocol: null as string | null,
  aave: null as string | null,
}));

vi.mock("@/hooks/useProtocolGate", () => ({
  useProtocolGateState: () => gateState,
}));

const addressTypeState = vi.hoisted(() => ({ isSupportedAddress: true }));

vi.mock("@/context/addressType", () => ({
  useAddressType: () => addressTypeState,
}));

vi.mock("@/components/Wallet", () => ({
  Connect: () => <button data-testid="connect-button" />,
}));

function renderVaultsPage(openDeposit = vi.fn()) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ openDeposit }} />}>
            <Route path="/" element={<VaultsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { openDeposit, view };
}

describe("VaultsPage", () => {
  beforeEach(() => {
    emptinessState.isLoading = false;
    emptinessState.isEmpty = true;
    emptinessState.hasError = false;
    emptinessState.hasPartialError = false;
    walletState.isConnected = true;
    gateState.protocol = null;
    gateState.aave = null;
    featureFlagsMock.isDepositDisabled = false;
    addressTypeState.isSupportedAddress = true;
  });

  it("shows the empty state with an enabled Deposit CTA when connected and empty", () => {
    const { openDeposit } = renderVaultsPage();

    expect(screen.getByText(COPY.vaults.empty.title)).toBeInTheDocument();
    expect(screen.getByText(COPY.vaults.empty.description)).toBeInTheDocument();

    const deposit = screen.getByTestId("deposit-button");
    expect(deposit).toBeEnabled();
    fireEvent.click(deposit);
    expect(openDeposit).toHaveBeenCalledTimes(1);
  });

  it("shows the connect prompt instead of the Deposit CTA when disconnected", () => {
    walletState.isConnected = false;

    renderVaultsPage();

    expect(screen.getByTestId("connect-button")).toBeInTheDocument();
    expect(screen.queryByTestId("deposit-button")).not.toBeInTheDocument();
  });

  it("shows a loader, not the empty state, while queries resolve", () => {
    emptinessState.isLoading = true;
    emptinessState.isEmpty = false;

    const { view } = renderVaultsPage();

    expect(view.container.querySelector(".bbn-loader")).toBeInTheDocument();
    expect(screen.queryByText(COPY.vaults.empty.title)).not.toBeInTheDocument();
    expect(screen.queryByTestId("deposit-button")).not.toBeInTheDocument();
  });

  it("shows the load-error message, not the empty state, when the reads failed", () => {
    emptinessState.isEmpty = false;
    emptinessState.hasError = true;

    renderVaultsPage();

    expect(screen.getByText(COPY.vaults.loadError)).toBeInTheDocument();
    expect(screen.queryByText(COPY.vaults.empty.title)).not.toBeInTheDocument();
    expect(screen.queryByTestId("deposit-button")).not.toBeInTheDocument();
  });

  it("renders the summary card and lifecycle sections when the account has vaults", () => {
    emptinessState.isEmpty = false;

    renderVaultsPage();

    expect(screen.queryByText(COPY.vaults.empty.title)).not.toBeInTheDocument();
    expect(screen.getByTestId("vaults-summary-card")).toBeInTheDocument();
    expect(screen.getByTestId("vaults-lifecycle-sections")).toBeInTheDocument();
    expect(screen.getByTestId("vaults-active-section")).toBeInTheDocument();
  });

  it("shows a partial-load warning over the populated layout when one source failed", () => {
    emptinessState.isEmpty = false;
    emptinessState.hasPartialError = true;

    renderVaultsPage();

    expect(screen.getByTestId("vaults-partial-load-error")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.vaults.partialLoadError.title),
    ).toBeInTheDocument();
    // The data the page does have still renders beneath the warning.
    expect(screen.getByTestId("vaults-summary-card")).toBeInTheDocument();
  });

  it("does not show the partial-load warning when both sources loaded", () => {
    emptinessState.isEmpty = false;

    renderVaultsPage();

    expect(
      screen.queryByTestId("vaults-partial-load-error"),
    ).not.toBeInTheDocument();
  });

  it("swaps to deposits-paused copy and disables the CTA when the flag is set", () => {
    featureFlagsMock.isDepositDisabled = true;

    renderVaultsPage();

    expect(screen.getByText(COPY.deposit.disabled.title)).toBeInTheDocument();
    const deposit = screen.getByTestId("deposit-button");
    expect(deposit).toBeInTheDocument();
    expect(deposit).toBeDisabled();
  });

  it("disables the Deposit CTA when the protocol gate blocks deposits", () => {
    gateState.protocol = "paused";

    renderVaultsPage();

    expect(screen.getByTestId("deposit-button")).toBeDisabled();
  });

  it("disables the Deposit CTA for a non-Taproot wallet address", () => {
    addressTypeState.isSupportedAddress = false;

    renderVaultsPage();

    expect(screen.getByTestId("deposit-button")).toBeDisabled();
  });
});
