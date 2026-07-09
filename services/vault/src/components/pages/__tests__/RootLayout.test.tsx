/**
 * RootLayout header wiring tests.
 *
 * The `Header`'s `logo` slot and `rightActions` NetworkBadge are both gated
 * on `FeatureFlags.isV3UiEnabled`:
 * - v2 (flag off, today's production path): `logo` is the v2 `BrandLockup`
 *   mark, no page-title heading, no NetworkBadge.
 * - v3 (flag on): `logo` is the current page title (`usePageTitle()`) as an
 *   `<h1>`, and `rightActions` gains a leading `NetworkBadge` (visible only
 *   on non-mainnet networks).
 *
 * These are locked in here since no other test exercises the real
 * (unmocked) RootLayout — `src/__tests__/router.test.tsx` mocks it away
 * entirely — and the v2 path is what ships to production today.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COPY } from "@/copy";

const featureFlagsMock = vi.hoisted(() => ({
  isV3UiEnabled: false,
  noticeBannerMessage: undefined as string | undefined,
  isDepositDisabled: false,
}));

const networkMock = vi.hoisted(() => ({ value: "mainnet" }));

// Local override of the global `@/config` mock (src/test/setup.ts) — that
// default doesn't export `FeatureFlags` or `shouldDisplayTestingMsg`, and
// `isV3UiEnabled` must be flippable per test case.
vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => networkMock.value,
  shouldDisplayTestingMsg: () => false,
}));

// A plain useContext consumer with no Provider mounted always sees the
// context's default value in RTL — `@/context/addressScreening` and
// `@/context/addressType` are left unmocked for exactly that reason. But
// `@/context/geofencing`'s own module (GeoFencingProvider.tsx, which also
// hosts the `useGeoFencing` export consumed here) imports `@/config/wagmi`
// at module scope, which imports `@babylonlabs-io/wallet-connector` — and
// that package's build cannot be transformed by Vitest in this workspace
// (see the wallet-connector mock below), so the real module can't even be
// loaded, not just "unsafe to render". Mocked here to return the exact same
// default the real context has (`isLoading: true`, so RootLayout stays on
// its Loader branch and the content-branch providers/components below it —
// AaveConfigProvider, ActivatingVaultsProvider, SimpleDeposit, GeoBlockState,
// ProtocolStatusBanner — never mount, matching the real unmocked behavior).
vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => ({ isGeoBlocked: false, isLoading: true }),
}));

vi.mock("@/context/wallet", () => ({
  useBTCWallet: () => ({ connected: false }),
  useETHWallet: () => ({ connected: false }),
}));

vi.mock("@/components/Wallet", () => ({
  Connect: () => <div data-testid="connect-stub" />,
}));

// `@babylonlabs-io/wallet-connector`'s build also can't be transformed by
// Vitest in this workspace (every existing test touching it — e.g.
// NetworkBadge.test.tsx, useDepositFlow.test.tsx — fully mocks the package
// rather than partially merging with the real one via `importOriginal`).
// `Network` is the only export RootLayout's real (unmocked) tree still
// needs — NetworkBadge imports it directly, and NetworkBadge is real here
// since it's under test.
vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: { MAINNET: "mainnet", SIGNET: "signet", TESTNET: "testnet" },
}));

// SimpleDeposit never mounts in any case below (RootLayout stays on its
// Loader branch — see the geofencing mock above), but it's still imported
// unconditionally at module scope. Its own import graph (DepositForm,
// DepositSignContent, ResumeDepositContent, and a dozen `hooks/deposit/*`
// files) directly imports several more `@babylonlabs-io/wallet-connector`
// exports (useChainConnector, getSharedWagmiConfig, isUserRejectionMessage,
// …) that the mock above doesn't provide. Stubbing the dead subtree here is
// far more targeted than growing the wallet-connector mock to satisfy code
// that never executes.
vi.mock("@/components/simple/SimpleDeposit", () => ({
  default: () => null,
}));

vi.mock("@babylonlabs-io/core-ui", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@babylonlabs-io/core-ui")>();
  return {
    ...actual,
    StandardSettingsMenu: () => <div data-testid="settings-menu-stub" />,
  };
});

import RootLayout from "../RootLayout";

function renderRootLayout() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <RootLayout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  featureFlagsMock.isV3UiEnabled = false;
  featureFlagsMock.noticeBannerMessage = undefined;
  featureFlagsMock.isDepositDisabled = false;
  networkMock.value = "mainnet";
});

describe("RootLayout — header wiring", () => {
  it("v2 (flag off): shows BrandLockup, no page-title heading, no NetworkBadge", () => {
    featureFlagsMock.isV3UiEnabled = false;

    renderRootLayout();

    // BrandLockup renders SmallLogo + a divider + the Aave wordmark image —
    // the alt text is the stable, concrete marker (see AppSidebar.tsx).
    expect(screen.getByAltText("Aave")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.header.networkBadge),
    ).not.toBeInTheDocument();
  });

  it("v3 flag on, mainnet: shows the page-title h1, no BrandLockup, no NetworkBadge", () => {
    featureFlagsMock.isV3UiEnabled = true;
    networkMock.value = "mainnet";

    renderRootLayout();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(COPY.nav.overview);
    // The logo slot is replaced, not just hidden behind the title.
    expect(screen.queryByAltText("Aave")).not.toBeInTheDocument();
    // Mainnet: NetworkBadge renders null.
    expect(
      screen.queryByText(COPY.header.networkBadge),
    ).not.toBeInTheDocument();
  });

  it("v3 flag on, signet: shows the page-title h1 and the NetworkBadge", () => {
    featureFlagsMock.isV3UiEnabled = true;
    networkMock.value = "signet";

    renderRootLayout();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(COPY.nav.overview);
    // Proves the NetworkBadge wiring reaches the DOM under realistic v3
    // conditions, not just that the JSX slot is reachable.
    expect(screen.getByText(COPY.header.networkBadge)).toBeInTheDocument();
  });
});
