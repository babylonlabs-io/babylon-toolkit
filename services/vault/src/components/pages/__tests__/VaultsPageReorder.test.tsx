/**
 * Ethereum-only access and the /vaults Reorder control (issue #2232).
 *
 * The connection gate decides whether the summary card's Reorder button is
 * reachable at all. These tests keep the real `useConnection` and the real
 * `useVaultsPageEmptiness`, and answer both data hooks from the address they
 * are handed, so removing the Ethereum-only term from the gate fails them.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import VaultsPage from "@/components/pages/VaultsPage";
import { COPY } from "@/copy";
import type { CollateralVaultEntry } from "@/types/collateral";

// The Ethereum-only switch reaches this page through one module path only:
// useConnection reads the default export of @/config/featureFlags. The other
// FeatureFlags reader here, VaultsPage itself, takes only the deposits
// kill-switch, which the repo-wide setup mock already leaves falsy.
const featureFlagsMock = vi.hoisted(() => ({
  isEthFirstEnabled: false,
}));

vi.mock("@/config/featureFlags", () => ({
  default: featureFlagsMock,
}));

const walletState = vi.hoisted(() => ({
  btcConnected: false,
  ethConnected: true,
  confirmed: true,
  address: "0x3333333333333333333333333333333333333333",
}));

// The three session hooks answer from walletState. useChainConnector is the
// fourth member this page reaches: the real useVaultsPageEmptiness resolves
// reclaim candidates through useReclaimRowAction, which asks for the BTC
// connector. No component here renders a reclaim row; that renderer is stubbed.
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  useWalletConnect: () => ({ connected: walletState.confirmed }),
  useBTCWallet: () => ({ connected: walletState.btcConnected }),
  useETHWallet: () => ({
    connected: walletState.ethConnected,
    address: walletState.address,
  }),
  useChainConnector: () => undefined,
}));

// The other half of that same reclaim action. Mocked as a module so the real
// one never loads, because it reads APPKIT_BTC_CONNECTOR_ID from the
// wallet-connector module at module scope, which the mock above does not carry.
vi.mock("@/context/wallet/VaultWalletConnectionProvider", () => ({
  isLedgerVaultConnector: () => false,
}));

// The real useVaultsPageEmptiness reads useActionableExpiredDeposits, which
// needs the polling context. No case here has an expired deposit, so an empty
// result keeps every expired activity actionable.
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ getPollingResult: () => undefined }),
}));

// The real gate, so the Ethereum-only control decides what this page treats as
// connected. A hand-supplied `isConnected` would pass with the control removed.
vi.mock("@/context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useETHWallet: (await import("@babylonlabs-io/wallet-connector")).useETHWallet,
  useBTCWallet: (await import("@babylonlabs-io/wallet-connector")).useBTCWallet,
}));

// Both data hooks answer from the address they are given — useVaultsPageData
// supplies the reorderable rows, and useDashboardState is what the real
// emptiness hook reads. A hook that ignored its argument would keep the page
// populated for a session the gate rejects.
const dataMocks = vi.hoisted(() => ({
  useVaultsPageData: vi.fn(),
  useDashboardState: vi.fn(),
}));

vi.mock("@/hooks/useVaultsPageData", () => ({
  useVaultsPageData: dataMocks.useVaultsPageData,
}));

vi.mock("@/hooks/useDashboardState", () => ({
  useDashboardState: dataMocks.useDashboardState,
}));

// The page's single usePendingDeposits instance, shared with the emptiness
// hook. No pending, expired or reclaimable deposits, so of the four terms
// useVaultsPageEmptiness counts, only collateral decides emptiness.
vi.mock("@/hooks/usePendingDeposits", () => ({
  usePendingDeposits: () => ({
    pendingActivities: [],
    expiredActivities: [],
    reclaimableCandidates: [],
    isLoading: false,
    error: null,
  }),
}));

// The real emptiness hook reads useActionableExpiredDeposits, which filters
// expired rows by their polled peg-in state. Nothing is polled here.
vi.mock("@/context/deposit/PeginPollingContext", () => ({
  usePeginPolling: () => ({ getPollingResult: () => undefined }),
}));

// The real emptiness hook also asks useActionableReclaims which settled
// deposits still have a reclaim to perform; that chain reaches wallet and
// chain reads. No candidates are handed in, so it answers nothing.
vi.mock("@/hooks/deposit/useActionableReclaims", () => ({
  NO_RECLAIMS_IN_FLIGHT: new Set<string>(),
  useActionableReclaims: () => ({
    candidates: [],
    actions: new Map(),
    isResolving: false,
  }),
}));

vi.mock("@/applications/aave/hooks", () => ({
  useAaveVaults: () => ({ vaults: [] }),
}));

vi.mock("@/applications/aave/context", () => ({
  useSyncPendingVaults: () => {},
}));

// The lifecycle lists are exercised in their own tests; this file only needs
// the summary card, which is left real because it renders the Reorder button.
vi.mock("@/components/vaults/VaultsLifecycleSections", () => ({
  VaultsLifecycleSections: () => <div />,
}));

vi.mock("@/components/vaults/VaultsActiveSection", () => ({
  VaultsActiveSection: () => <div />,
}));

vi.mock("@/components/simple/WithdrawFlow", () => ({
  default: () => null,
}));

// Stubbed so the click assertion measures the modal's open state rather than
// the drag-and-drop list inside it. The vaults it receives are recorded,
// because that payload is derived from the address the gate hands the page.
const reorderModalVaultIds = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock("@/components/simple/ReorderVaults", () => ({
  ReorderVaultsModal: ({
    isOpen,
    vaults,
  }: {
    isOpen: boolean;
    vaults: Array<{ id: string }>;
  }) => {
    reorderModalVaultIds.current = vaults.map((vault) => vault.id);
    return isOpen ? <div data-testid="reorder-vaults-modal" /> : null;
  },
  ReorderSuccessModal: () => null,
}));

vi.mock("@/components/Wallet", () => ({
  Connect: () => <button data-testid="connect-button" />,
}));

// Two active vaults, because the page needs at least two before Reorder is
// enabled, plus one activating row. Only the active ones are reorderable, so
// the third row is what makes the modal-payload assertion below distinguish
// the filtered list from the raw one.
const collateralVaults: CollateralVaultEntry[] = [
  {
    id: "collateral-1",
    vaultId:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    amountBtc: 0.6,
    addedAt: 1_750_000_000,
    inUse: true,
    lifecycle: "active",
    providerAddress: "0x4444444444444444444444444444444444444444",
    providerName: "Provider One",
    liquidationIndex: 0,
  },
  {
    id: "collateral-2",
    vaultId:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    amountBtc: 0.2,
    addedAt: 1_750_000_100,
    inUse: true,
    lifecycle: "active",
    providerAddress: "0x5555555555555555555555555555555555555555",
    providerName: "Provider Two",
    liquidationIndex: 1,
  },
  // Shaped as useDashboardState emits an activating row: prefixed id, no
  // indexed metadata, and a sentinel liquidation index.
  {
    id: "activating-0x3333333333333333333333333333333333333333333333333333333333333333",
    vaultId:
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    amountBtc: 0.1,
    addedAt: 0,
    inUse: false,
    lifecycle: "activating",
    providerAddress: "0x6666666666666666666666666666666666666666",
    providerName: "Provider Three",
    liquidationIndex: Number.MAX_SAFE_INTEGER,
  },
];

function renderVaultsPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Routes>
          <Route element={<Outlet context={{ openDeposit: vi.fn() }} />}>
            <Route path="/" element={<VaultsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("VaultsPage Reorder under Ethereum-only access", () => {
  beforeEach(() => {
    walletState.btcConnected = false;
    walletState.ethConnected = true;
    walletState.confirmed = true;
    featureFlagsMock.isEthFirstEnabled = false;
    reorderModalVaultIds.current = [];

    dataMocks.useVaultsPageData.mockReset();
    dataMocks.useVaultsPageData.mockImplementation(
      (address: string | undefined) => {
        const vaults = address === undefined ? [] : collateralVaults;
        return {
          summary: {
            totalCollateralBtc: address === undefined ? "0 sBTC" : "0.9 sBTC",
            totalCollateralUsd:
              address === undefined ? "$0 USD" : "$90,000 USD",
            // countActiveVaults counts active and activating alike, so with no
            // withdrawing row that is every row here.
            activeVaultsCount: vaults.length,
            liquidationOrder: null,
            healthFactor: null,
            healthFactorStatus: "no_debt" as const,
          },
          displayVaults: vaults,
          rawCollateralVaults: vaults,
          collateralBtc: address === undefined ? 0 : 0.9,
          collateralValueUsd: address === undefined ? 0 : 90_000,
        };
      },
    );

    dataMocks.useDashboardState.mockReset();
    dataMocks.useDashboardState.mockImplementation(
      (address: string | undefined) => ({
        hasDisplayCollateral: address !== undefined,
        isLoading: false,
        positionError: null,
        indexerError: null,
      }),
    );
  });

  it("offers an enabled Reorder button to a confirmed Ethereum wallet with no Bitcoin wallet", () => {
    featureFlagsMock.isEthFirstEnabled = true;

    renderVaultsPage();

    expect(dataMocks.useVaultsPageData).toHaveBeenCalledWith(
      walletState.address,
    );
    expect(
      screen.getByRole("button", { name: COPY.vaults.actions.reorder }),
    ).toBeEnabled();
  });

  it("opens the reorder modal when that Ethereum-only session clicks Reorder", () => {
    featureFlagsMock.isEthFirstEnabled = true;

    renderVaultsPage();

    expect(
      screen.queryByTestId("reorder-vaults-modal"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: COPY.vaults.actions.reorder }),
    );
    expect(screen.getByTestId("reorder-vaults-modal")).toBeInTheDocument();
    // An empty modal would still open, so the rows the gate produced are what
    // this assertion is for. The activating row must not be among them.
    expect(reorderModalVaultIds.current).toEqual([
      "collateral-1",
      "collateral-2",
    ]);
  });

  it("shows the connect prompt instead of Reorder for the same session while Ethereum-only access is off", () => {
    renderVaultsPage();

    expect(dataMocks.useVaultsPageData).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId("connect-button")).toBeInTheDocument();
    expect(
      screen.getByText(COPY.vaults.empty.disconnected),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: COPY.vaults.actions.reorder }),
    ).not.toBeInTheDocument();
  });
});
