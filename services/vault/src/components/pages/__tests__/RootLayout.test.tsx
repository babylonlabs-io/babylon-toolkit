/**
 * RootLayout header wiring tests.
 *
 * The `Header`'s `logo` slot is the current page title (`usePageTitle()`) as an
 * `<h1>`, and `rightActions` carries a leading `NetworkBadge` (visible only on
 * non-mainnet networks).
 *
 * These are locked in here since no other test exercises the real
 * (unmocked) RootLayout — `src/__tests__/router.test.tsx` mocks it away
 * entirely.
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CRITICAL_BANNER_SLOT_ID } from "@/components/simple/CriticalLiquidationTopBanner";
import { COPY } from "@/copy";

const featureFlagsMock = vi.hoisted(() => ({
  noticeBannerMessage: undefined as string | undefined,
  isDepositDisabled: false,
  isEthFirstEnabled: false,
}));

const networkMock = vi.hoisted(() => ({ value: "mainnet" }));
const mobileMock = vi.hoisted(() => ({ value: false }));

vi.mock("@/config", () => ({
  FeatureFlags: featureFlagsMock,
  getNetworkConfigBTC: () => ({ coinSymbol: "sBTC" }),
  getBTCNetwork: () => networkMock.value,
}));

vi.mock("@/context/geofencing", () => ({
  useGeoFencing: () => ({ isGeoBlocked: false, isLoading: true }),
}));

const walletMock = vi.hoisted(() => ({
  btcConnected: false,
  ethConnected: false,
  confirmed: true,
  isAddressBlocked: false,
  isSupportedAddress: true,
}));
vi.mock("@/context/addressScreening", () => ({
  useAddressScreening: () => ({ isBlocked: walletMock.isAddressBlocked }),
}));
vi.mock("@/context/addressType", () => ({
  useAddressType: () => ({ isSupportedAddress: walletMock.isSupportedAddress }),
}));
vi.mock("@/context/wallet", async () => ({
  useConnection: (await import("@/context/wallet/useConnection")).useConnection,
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({ connected: walletMock.ethConnected }),
}));

// The god-mode status override is compile-time null in production (gated on
// `import.meta.env.DEV` + the god-mode flag), so the real store never emits one
// in tests. Override just this hook to drive RootLayout's status derivation.
const debugStatusMock = vi.hoisted(
  () => ({ value: null }) as { value: "frozen" | "paused" | null },
);
vi.mock("@/overrides/protocolStatus", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/overrides/protocolStatus")>();
  return {
    ...actual,
    useProtocolStatusOverride: () => debugStatusMock.value,
  };
});

vi.mock("@/components/Wallet", () => ({
  Connect: () => <div data-testid="connect-stub" />,
}));

vi.mock("@babylonlabs-io/wallet-connector", () => ({
  Network: { MAINNET: "mainnet", SIGNET: "signet" },
  useBTCWallet: () => ({ connected: walletMock.btcConnected }),
  useETHWallet: () => ({ connected: walletMock.ethConnected }),
  useWalletConnect: () => ({ connected: walletMock.confirmed, open: vi.fn() }),
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
    useIsMobile: () => mobileMock.value,
    StandardSettingsMenu: () => <div data-testid="settings-menu-stub" />,
  };
});

import RootLayout from "../RootLayout";

function renderRootLayout(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RootLayout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  featureFlagsMock.noticeBannerMessage = undefined;
  featureFlagsMock.isDepositDisabled = false;
  featureFlagsMock.isEthFirstEnabled = false;
  vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", undefined);
  networkMock.value = "mainnet";
  mobileMock.value = false;
  walletMock.btcConnected = false;
  walletMock.ethConnected = false;
  walletMock.confirmed = true;
  walletMock.isAddressBlocked = false;
  walletMock.isSupportedAddress = true;
  debugStatusMock.value = null;
});

afterEach(() => vi.unstubAllEnvs());

describe("RootLayout — header wiring", () => {
  it("mainnet: shows the page-title h1, no BrandLockup, no NetworkBadge", () => {
    networkMock.value = "mainnet";
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;

    renderRootLayout();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(COPY.nav.overview);
    // The logo slot is the page title, not the BrandLockup wordmark.
    expect(screen.queryByRole("img", { name: "Aave" })).not.toBeInTheDocument();
    // Mainnet: NetworkBadge renders null.
    expect(
      screen.queryByText(COPY.header.networkBadge),
    ).not.toBeInTheDocument();
  });

  it("signet: shows the page-title h1 and the NetworkBadge", () => {
    networkMock.value = "signet";
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;

    renderRootLayout();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(COPY.nav.overview);
    // Proves the NetworkBadge wiring reaches the DOM under realistic v3
    // conditions, not just that the JSX slot is reachable.
    expect(screen.getByText(COPY.header.networkBadge)).toBeInTheDocument();
  });

  it("shows the sidebar when both wallets are connected", () => {
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;

    renderRootLayout();

    expect(document.querySelector("aside")).toBeInTheDocument();
  });

  it.each([
    { btcConnected: false, ethConnected: false, confirmed: false },
    { btcConnected: true, ethConnected: false, confirmed: true },
    { btcConnected: false, ethConnected: true, confirmed: true },
    { btcConnected: true, ethConnected: true, confirmed: false },
  ])("keeps the entry layout until both wallets are confirmed: %o", (state) => {
    Object.assign(walletMock, state);
    const { container, rerender } = renderRootLayout();
    expect(document.querySelector("aside")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aave" })).toBeInTheDocument();
    expect(
      container.querySelector(".\\!max-w-\\[1280px\\]"),
    ).toBeInTheDocument();

    Object.assign(walletMock, {
      btcConnected: true,
      ethConnected: true,
      confirmed: true,
    });
    rerender(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    );
    expect(document.querySelector("aside")).toBeInTheDocument();
  });

  it.each([
    { btcConnected: false, ethConnected: false, confirmed: false },
    { btcConnected: true, ethConnected: false, confirmed: true },
    { btcConnected: false, ethConnected: true, confirmed: false },
    { btcConnected: true, ethConnected: true, confirmed: false },
  ])("requires confirmed Ethereum with optional Bitcoin: %o", (state) => {
    featureFlagsMock.isEthFirstEnabled = true;
    vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
    Object.assign(walletMock, state);
    const { rerender } = renderRootLayout();

    expect(document.querySelector("aside")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aave" })).toBeInTheDocument();

    Object.assign(walletMock, {
      btcConnected: false,
      ethConnected: true,
      confirmed: true,
    });
    rerender(
      <MemoryRouter>
        <RootLayout />
      </MemoryRouter>,
    );

    expect(document.querySelector("aside")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      COPY.nav.overview,
    );
  });

  it("disconnected: keeps the legal links reachable via the entry footer", () => {
    const { container } = renderRootLayout();

    // The sidebar normally carries these, and it is gone on this screen.
    const footer = container.querySelector("footer");
    expect(footer).toHaveTextContent(COPY.nav.termsOfUse);
    expect(footer).toHaveTextContent(COPY.nav.privacyPolicy);
    expect(container.querySelectorAll("footer")).toHaveLength(1);
  });

  it("keeps the shell on the other routes while disconnected", () => {
    // Only the landing is the entry frame. /vaults and /activity render
    // disconnected states on purpose, and dropping the sidebar there would
    // leave a desktop visitor with no navigation at all.
    const { container } = renderRootLayout("/vaults");

    expect(document.querySelector("aside")).toBeInTheDocument();
    expect(
      container.querySelector(".\\!max-w-\\[1280px\\]"),
    ).not.toBeInTheDocument();
  });

  it("keeps the critical-banner portal slot mounted across the mobile breakpoint", () => {
    const { rerender } = renderRootLayout();
    const slot = document.getElementById(CRITICAL_BANNER_SLOT_ID);

    mobileMock.value = true;
    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <RootLayout />
      </MemoryRouter>,
    );

    expect(document.getElementById(CRITICAL_BANNER_SLOT_ID)).toBe(slot);
    expect(slot).toBeInTheDocument();
  });

  it("keeps legal links visible in the page footer on mobile", () => {
    mobileMock.value = true;

    const { container } = renderRootLayout();
    const footer = container.querySelector("footer");

    expect(footer).toHaveTextContent(COPY.nav.termsOfUse);
    expect(footer).toHaveTextContent(COPY.nav.privacyPolicy);
  });
});

describe("RootLayout — operator message banner", () => {
  const OPERATOR_MESSAGE = "Deposits resume at 15:00 UTC.";

  it("shows the operator message as a standalone notice when nothing is disabled", () => {
    featureFlagsMock.noticeBannerMessage = OPERATOR_MESSAGE;

    renderRootLayout();

    // No deposit-disabled / status banner is active, so the message renders
    // once, as the standalone top-of-app notice.
    expect(screen.getAllByText(OPERATOR_MESSAGE)).toHaveLength(1);
  });

  it("hides the standalone notice when no operator message is set", () => {
    renderRootLayout();

    expect(screen.queryByText(OPERATOR_MESSAGE)).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "shows wallet warnings with confirmed=%s",
    (confirmed) => {
      Object.assign(walletMock, {
        btcConnected: true,
        ethConnected: true,
        confirmed,
        isAddressBlocked: true,
        isSupportedAddress: false,
      });
      featureFlagsMock.isDepositDisabled = true;
      renderRootLayout();
      expect(
        screen.getByText(COPY.wallet.addressScreeningBannerBody),
      ).toBeInTheDocument();
      expect(screen.getByText("Taproot Address Required")).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.disabled.bannerMessage),
      ).toBeInTheDocument();
    },
  );

  it.each([false, true])(
    "keeps screening and deposit warnings for Ethereum alone with confirmed=%s",
    (confirmed) => {
      featureFlagsMock.isEthFirstEnabled = true;
      vi.stubEnv("NEXT_PUBLIC_FF_ENABLE_ETH_FIRST", "true");
      Object.assign(walletMock, {
        ethConnected: true,
        confirmed,
        isAddressBlocked: true,
        isSupportedAddress: false,
      });
      featureFlagsMock.isDepositDisabled = true;
      renderRootLayout();

      expect(
        screen.getByText(COPY.wallet.addressScreeningBannerBody),
      ).toBeInTheDocument();
      expect(
        screen.getByText(COPY.deposit.disabled.bannerMessage),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Taproot Address Required"),
      ).not.toBeInTheDocument();
    },
  );

  it("suppresses the standalone notice while the deposit-disabled banner is active", () => {
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    featureFlagsMock.isDepositDisabled = true;
    featureFlagsMock.noticeBannerMessage = OPERATOR_MESSAGE;

    renderRootLayout();

    // The deposit-disabled banner is the active banner and carries the message,
    // so the standalone notice is suppressed — the operator text must not appear
    // a second time as its own top-of-app strip. (The deposit-disabled banner's
    // own text-override is covered in DepositDisabledBanner.test.tsx.)
    expect(screen.queryByText(OPERATOR_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.getByText(COPY.deposit.disabled.bannerMessage),
    ).toBeInTheDocument();
  });

  it("suppresses the deposit-disabled and standalone banners under a god-mode status override", () => {
    // A forced frozen/paused preview means the protocol status banner owns the
    // message, so RootLayout must suppress the other two even though the gate is
    // healthy — the deposit-disabled default copy must not leak through, and the
    // operator message must not appear as a standalone strip.
    debugStatusMock.value = "frozen";
    walletMock.btcConnected = true;
    walletMock.ethConnected = true;
    featureFlagsMock.isDepositDisabled = true;
    featureFlagsMock.noticeBannerMessage = OPERATOR_MESSAGE;

    renderRootLayout();

    expect(screen.queryByText(OPERATOR_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.queryByText(COPY.deposit.disabled.bannerMessage),
    ).not.toBeInTheDocument();
  });
});
