import {
  FullScreenDialog,
  Header,
  Heading,
  Loader,
  MobileLogo,
  StandardSettingsMenu,
  Text,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import {
  type CSSProperties,
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation } from "react-router";
import { twJoin } from "tailwind-merge";

import { AppSidebar, V3MobileNavigation } from "@/components/shared/AppSidebar";
import { BrandLockup } from "@/components/shared/BrandLockup";
import { EntryFooter } from "@/components/shared/EntryFooter";
import {
  ENTRY_CONTENT_CLASS,
  PAGE_CONTENT_CLASS,
} from "@/components/shared/layoutClasses";
import { SidebarFooter } from "@/components/shared/SidebarFooter";
import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { CRITICAL_BANNER_SLOT_ID } from "@/components/simple/CriticalLiquidationTopBanner";
import { FeatureFlags } from "@/config";
import { useAddressScreening } from "@/context/addressScreening";
import { useAddressType } from "@/context/addressType";
import { AppPeginPollingProvider } from "@/context/deposit/AppPeginPollingProvider";
import { useGeoFencing } from "@/context/geofencing";
import { useConnection, useRequireBtcWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useDebugProtocolStatusOverride } from "@/dev/debugPositionStore";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useProtocolGateState } from "@/hooks/useProtocolGate";
import { ensureBtcEccInitialized } from "@/utils/btc/ensureBtcEccInitialized";
import { lazyWithRetry } from "@/utils/lazyWithRetry";

import {
  AaveConfigProvider,
  ActivatingVaultsProvider,
} from "../../applications/aave/context";
import { AddressScreeningBanner } from "../shared/AddressScreeningBanner";
import { AddressTypeBanner } from "../shared/AddressTypeBanner";
import { DepositDisabledBanner } from "../shared/DepositDisabledBanner";
import { GeoBlockState } from "../shared/GeoBlockState";
import { NetworkBadge } from "../shared/NetworkBadge";
import { NoticeBanner } from "../shared/NoticeBanner";
import { resolveBannerStatus } from "../shared/protocolStatus";
import { ProtocolStatusBanner } from "../shared/ProtocolStatusBanner";
import { Connect } from "../Wallet";

// Deposit owns the Bitcoin/WASM-heavy graph. Do not fetch or instantiate it
// for an ETH-only session until the user explicitly starts a BTC signing flow.
const SimpleDeposit = lazyWithRetry(async () => {
  await ensureBtcEccInitialized();
  return import("../simple/SimpleDeposit");
});

export interface RootLayoutContext {
  openDeposit: (initialAmountBtc?: string) => void;
}

// Stacking order of the two full-bleed top banners.
// core-ui's Dialog / FullScreenDialog render at `z-50` (backdrop `z-40`) from a
// portal whose container (`providers.tsx` app root) establishes no stacking
// context, so they resolve against the root one — the same one these banners
// compete in. Figma §2 (node 10092-19911) asks that of the critical banner only,
// so it alone outranks a modal; the deposit-disabled notice keeps its original
// `z-30` and still passes under the backdrop.
// The two therefore stick independently rather than sharing one sticky wrapper:
// `position: sticky` always creates a stacking context, so a shared sticky
// parent would trap both children at the parent's z-index and drag the
// deposit-disabled banner over modals with the critical one. The measured
// wrapper stays static (no stacking context of its own) so each child's z-index
// resolves against the root as described above.
const CRITICAL_BANNER_Z_CLASS = "z-[60]";
const DEPOSIT_DISABLED_BANNER_Z_CLASS = "z-30";

export default function RootLayout() {
  const gate = useProtocolGateState();
  const { theme, setTheme } = useTheme();
  const { isConnected, btcConnected } = useConnection();
  const { requireBtcWallet } = useRequireBtcWallet();
  const { open: openWallet } = useWalletConnect();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked } = useAddressScreening();
  const { isSupportedAddress } = useAddressType();
  const isMobileView = useIsMobile();
  const pageTitle = usePageTitle();
  const { pathname } = useLocation();

  const isWalletConnected = isConnected;
  // One signal for "is this the entry frame", so the sidebar and the chrome
  // that replaces it can never disagree. The other routes render disconnected
  // states on purpose and keep their shell — without it a disconnected desktop
  // visitor to /vaults would have no navigation at all.
  const isEntryLayout = !isWalletConnected && pathname === "/";
  const showV3Sidebar = !isMobileView && !isEntryLayout;
  const showAddressTypeBanner = btcConnected && !isSupportedAddress;
  // Match ProtocolStatusBanner's status derivation: the dev-only god-mode
  // override (compile-time null in production) wins over the live gate, so a
  // forced frozen/paused preview drives banner suppression here too and can't
  // leave a second banner visible.
  const statusOverride = useDebugProtocolStatusOverride();
  const hasProtocolStatus =
    (statusOverride ?? resolveBannerStatus(gate)) !== null;
  // Deposit kill-switch banner. Suppressed when a frozen/paused status banner is
  // active, since that banner already explains the disabled state.
  const showDepositDisabledBanner =
    !isGeoBlocked &&
    isWalletConnected &&
    FeatureFlags.isDepositDisabled &&
    !hasProtocolStatus;
  // The operator message (NEXT_PUBLIC_NOTICE_BANNER_MESSAGE) is context-aware:
  // when a status or deposit-disabled banner is showing it fills that banner's
  // text, so the standalone notice renders only when neither is — otherwise the
  // same message would appear twice.
  const showStandaloneNotice =
    Boolean(FeatureFlags.noticeBannerMessage) &&
    !hasProtocolStatus &&
    !showDepositDisabledBanner;
  // The deposit-disabled banner (Figma node 10084:28515) and the critical
  // near-liquidation banner (node 10204-45613) both render full-width above the
  // sidebar. Measure the wrapper's combined height and expose it as a CSS
  // variable so the sticky v3 sidebar can offset its top/height and avoid
  // clipping its footer. Zero when both are hidden, so the common case is
  // unaffected.
  //
  // Observe the node rather than keying the effect on banner state: the critical
  // banner is portaled in from the dashboard, a React tree this component never
  // re-renders with, so a dependency list could not see it appear or disappear
  // and the variable would go stale exactly when the wrapper grew. One
  // measurement mechanism, driven by the element itself, covers both sources.
  const topBannerRef = useRef<HTMLDivElement>(null);
  const [topBannerHeight, setTopBannerHeight] = useState(0);
  useLayoutEffect(() => {
    const node = topBannerRef.current;
    if (!node) return;

    const measure = () => setTopBannerHeight(node.offsetHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [initialDepositAmountBtc, setInitialDepositAmountBtc] = useState<
    string | undefined
  >();

  // Reject a click event reaching `initialAmountBtc`: TypeScript allows this
  // where an `onClick` handler is expected, and it crashes the deposit dialog.
  const openDeposit = useCallback(
    (initialAmountBtc?: string) => {
      if (!isConnected) {
        openWallet();
        return;
      }
      if (!requireBtcWallet()) return;
      setInitialDepositAmountBtc(
        typeof initialAmountBtc === "string" ? initialAmountBtc : undefined,
      );
      setIsDepositOpen(true);
    },
    [isConnected, openWallet, requireBtcWallet],
  );

  const closeDeposit = useCallback(() => {
    setIsDepositOpen(false);
    setInitialDepositAmountBtc(undefined);
  }, []);

  // Sidebar-agnostic: rendered unconditionally as the content column's first
  // child (see below). Mobile never shows the sidebar, so the content column is
  // full-width there; on desktop the sidebar is a flex sibling of the content
  // column, not a descendant, so banner height here never pushes the sidebar's
  // `sticky top-0 h-svh` position down or clips its footer.
  const operationalBanners = (
    <>
      {/* Intentionally not gated on `isGeoBlocked`: an operator notice
          describes a service-wide condition and renders in the top banner
          stack (above the geo-block screen), so geo-blocked sessions must
          see it too. */}
      <NoticeBanner
        visible={showStandaloneNotice}
        message={FeatureFlags.noticeBannerMessage ?? ""}
      />
      <AddressScreeningBanner
        visible={!isGeoBlocked && isWalletConnected && isAddressBlocked}
      />
      <AddressTypeBanner visible={!isGeoBlocked && showAddressTypeBanner} />
    </>
  );

  return (
    <div
      className="relative flex min-h-svh w-full flex-col bg-surface"
      style={
        { "--tbv-top-banner-height": `${topBannerHeight}px` } as CSSProperties
      }
    >
      <div ref={topBannerRef}>
        {/* Portal target for the critical near-liquidation banner. It lives in
            this wrapper — a sibling ABOVE the sidebar/content row — so the red
            bar spans the entire window width including the side nav, per Figma
            §D / node 10204-45613, and so the wrapper's height measurement above
            covers it too (no second mechanism needed). The consumer
            (`CriticalLiquidationTopBanner`) resolves this node once on mount via
            `getElementById` and holds the reference, so it must stay mounted for
            the life of the app. Owned by the dashboard (where the Aave data +
            debug override live) but portaled here so it renders above the header
            and above the deposit-disabled banner. */}
        <div
          id={CRITICAL_BANNER_SLOT_ID}
          className={twJoin("sticky top-0", CRITICAL_BANNER_Z_CLASS)}
        />
        <div
          className={twJoin("sticky top-0", DEPOSIT_DISABLED_BANNER_Z_CLASS)}
        >
          <DepositDisabledBanner visible={showDepositDisabledBanner} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1">
        {showV3Sidebar && <AppSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          {operationalBanners}
          <Header
            size="md"
            // The Figma top-bar divider (border-b) sits the page content 24px
            // below it (mb-6).
            className="mb-6 border-b border-secondary-strokeLight"
            // `PAGE_CONTENT_CLASS` overrides the `container` width core-ui's
            // Header applies by default, so the navbar shares the same content
            // box as the page body and footer.
            containerClassName={
              isEntryLayout ? ENTRY_CONTENT_CLASS : PAGE_CONTENT_CLASS
            }
            logo={
              isEntryLayout ? (
                <BrandLockup />
              ) : (
                <Heading
                  variant="h5"
                  as="h1"
                  className="font-normal text-accent-primary"
                >
                  {pageTitle}
                </Heading>
              )
            }
            mobileLogo={
              <div className="[&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
                <MobileLogo />
              </div>
            }
            mobileNavigation={<V3MobileNavigation />}
            rightActions={
              <div className="flex items-center gap-4">
                <NetworkBadge />
                <Connect />
                <StandardSettingsMenu theme={theme} setTheme={setTheme} />
              </div>
            }
          />

          {isGeoLoading ? (
            <div className="flex min-h-[50vh] items-center justify-center">
              <Loader />
            </div>
          ) : isGeoBlocked ? (
            <GeoBlockState />
          ) : (
            <ActivatingVaultsProvider>
              {/* The app's only PeginPollingProvider mount. Deliberately inside
                  the content branch — a geo-blocked session renders no deposit
                  UI and must not poll — and deliberately above both <Outlet>
                  and <SimpleDeposit>, which are siblings: any provider mounted
                  on a route would miss the deposit flow. */}
              <AppPeginPollingProvider>
                {/* Intentionally in the content branch (not the top stack like
                  NoticeBanner): a geo-blocked session is already fully blocked
                  from transacting and sees the geo-block screen, so it doesn't
                  need the status banner the way it still needs operator notices. */}
                <ProtocolStatusBanner />
                <Outlet
                  context={
                    {
                      openDeposit,
                    } satisfies RootLayoutContext
                  }
                />
                {/* On config failure, suppress the default panel (would leak
                  into page chrome) and instead surface an error modal only
                  when the user has actually opened the deposit dialog, so
                  the click has a visible recovery path.

                  Mounting AaveConfigProvider inside the `isDepositOpen` gate
                  costs the first open nothing: every route that can reach
                  `openDeposit` already mounts one (router.tsx's
                  AaveOverlayLayout and ActivityWithProviders), and the
                  `["aaveAppConfig"]` query key is shared with a 5-minute
                  staleTime, so this instance resolves straight from cache.
                  The real first-open latency is the lazy chunk download plus
                  ECC init — which is why the Suspense fallback below is a
                  visible dialog rather than null. */}
                {isDepositOpen && (
                  <Suspense
                    fallback={
                      <V3ModalShell open onClose={closeDeposit}>
                        <div className="flex w-full justify-center">
                          <Loader />
                        </div>
                      </V3ModalShell>
                    }
                  >
                    <AaveConfigProvider
                      errorFallback={
                        <FullScreenDialog
                          open
                          onClose={closeDeposit}
                          className="items-center justify-center p-6"
                        >
                          <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 text-center">
                            <Text variant="body1" className="font-medium">
                              {COPY.common.somethingWentWrong.heading}
                            </Text>
                            <Text
                              variant="body2"
                              className="text-accent-secondary"
                            >
                              {COPY.common.somethingWentWrong.body}
                            </Text>
                          </div>
                        </FullScreenDialog>
                      }
                    >
                      <SimpleDeposit
                        open
                        onClose={closeDeposit}
                        initialAmountBtc={initialDepositAmountBtc}
                      />
                    </AaveConfigProvider>
                  </Suspense>
                )}
              </AppPeginPollingProvider>
            </ActivatingVaultsProvider>
          )}
          {isEntryLayout && <EntryFooter />}
          {isMobileView && !isEntryLayout && (
            // No page-level footer on desktop (the sidebar's own bottom block
            // covers it) but mobile has no sidebar at all, and
            // `V3MobileNavigation`'s copy of this block only renders inside
            // the collapsed hamburger menu — a mobile user who never opens
            // it would otherwise have no path to the social/legal links
            // anywhere on the page. Always visible here instead.
            <footer className="mt-auto p-5">
              <SidebarFooter />
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
