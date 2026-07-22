import {
  Footer,
  FullScreenDialog,
  Header,
  Heading,
  Loader,
  MobileLogo,
  Nav,
  type SocialLink,
  StandardSettingsMenu,
  TestingBanner,
  Text,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import {
  type CSSProperties,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { BsDiscord, BsGithub, BsLinkedin } from "react-icons/bs";
import { FaXTwitter } from "react-icons/fa6";
import { NavLink, Outlet, useLocation } from "react-router";
import { twJoin } from "tailwind-merge";

import { DepositButton } from "@/components/shared";
import {
  AppSidebar,
  BrandLockup,
  V3MobileNavigation,
} from "@/components/shared/AppSidebar";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { SidebarFooter } from "@/components/shared/SidebarFooter";
import { CRITICAL_BANNER_SLOT_ID } from "@/components/simple/CriticalLiquidationTopBanner";
import {
  FeatureFlags,
  getNetworkConfigBTC,
  shouldDisplayTestingMsg,
} from "@/config";
import { useAddressScreening } from "@/context/addressScreening";
import { useAddressType } from "@/context/addressType";
import { useGeoFencing } from "@/context/geofencing";
import { COPY } from "@/copy";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useProtocolGateState } from "@/hooks/useProtocolGate";

import {
  AaveConfigProvider,
  ActivatingVaultsProvider,
} from "../../applications/aave/context";
import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { AddressScreeningBanner } from "../shared/AddressScreeningBanner";
import { AddressTypeBanner } from "../shared/AddressTypeBanner";
import { DepositDisabledBanner } from "../shared/DepositDisabledBanner";
import { GeoBlockState } from "../shared/GeoBlockState";
import { NetworkBadge } from "../shared/NetworkBadge";
import { NoticeBanner } from "../shared/NoticeBanner";
import {
  isDepositBlocked,
  resolveBannerStatus,
} from "../shared/protocolStatus";
import { ProtocolStatusBanner } from "../shared/ProtocolStatusBanner";
import SimpleDeposit from "../simple/SimpleDeposit";
import { Connect } from "../Wallet";

export interface RootLayoutContext {
  openDeposit: (initialAmountBtc?: string) => void;
}

const btcConfig = getNetworkConfigBTC();

function MailIcon({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 27 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M2.66667 21.3333C1.93333 21.3333 1.30578 21.0724 0.784 20.5507C0.262222 20.0289 0.000888889 19.4009 0 18.6667V2.66667C0 1.93333 0.261333 1.30578 0.784 0.784C1.30667 0.262222 1.93422 0.000888889 2.66667 0H24C24.7333 0 25.3613 0.261333 25.884 0.784C26.4067 1.30667 26.6676 1.93422 26.6667 2.66667V18.6667C26.6667 19.4 26.4058 20.028 25.884 20.5507C25.3622 21.0733 24.7342 21.3342 24 21.3333H2.66667ZM13.3333 12L24 5.33333V2.66667L13.3333 9.33333L2.66667 2.66667V5.33333L13.3333 12Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Footer social links, ordered to match the TBV Figma footer.
const FOOTER_SOCIAL_LINKS: SocialLink[] = [
  { name: "GitHub", url: "https://github.com/babylonlabs-io", Icon: BsGithub },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/company/babylon-labs-official",
    Icon: BsLinkedin,
  },
  { name: "Email", url: "mailto:contact@babylonlabs.io", Icon: MailIcon },
  { name: "Discord", url: "https://discord.gg/babylonglobal", Icon: BsDiscord },
  { name: "X", url: "https://x.com/babylonlabs_io", Icon: FaXTwitter },
];

// Shifts the footer's social/copyright block in from the viewport edge by
// however much the 1080px `PAGE_CONTENT_CLASS` box is currently inset, so it
// starts at the same x-position as the navbar/body instead of the raw edge.
const FOOTER_SOCIAL_MARGIN_CLASS = "md:ml-[max(0px,calc((100vw-1080px)/2))]";

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

function AppNavLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        twJoin(
          "flex h-10 w-fit items-center justify-center whitespace-nowrap text-center",
          isActive ? "text-accent-primary" : "text-accent-secondary",
        )
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * Desktop navigation component
 */
function DesktopNavigation() {
  return (
    <Nav>
      <AppNavLink to="/">Dashboard</AppNavLink>
      <AppNavLink to="/activity">Activity</AppNavLink>
    </Nav>
  );
}

/**
 * Mobile navigation component
 */
function MobileNavigation() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <AppNavLink to="/">Dashboard</AppNavLink>
      <AppNavLink to="/activity">Activity</AppNavLink>
    </div>
  );
}

export default function RootLayout() {
  const gate = useProtocolGateState();
  const { theme, setTheme } = useTheme();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();
  const { isBlocked: isAddressBlocked } = useAddressScreening();
  const { isSupportedAddress } = useAddressType();
  const isMobileView = useIsMobile();
  const pageTitle = usePageTitle();
  const showV3Sidebar = FeatureFlags.isV3UiEnabled && !isMobileView;

  const isWalletConnected = btcConnected && ethConnected;
  const showAddressTypeBanner = isWalletConnected && !isSupportedAddress;
  // Deposit kill-switch banner. Suppressed when a frozen/paused status banner is
  // active, since that banner already explains the disabled state.
  const showDepositDisabledBanner =
    !isGeoBlocked &&
    isWalletConnected &&
    FeatureFlags.isDepositDisabled &&
    resolveBannerStatus(gate) === null;
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
  // The disconnected dashboard landing (DisconnectedOverview / "Native Bitcoin
  // backed borrowing") is vertically centered via `my-auto` on its Container.
  // On that screen only, drop the footer's top margins (the wrapper's `mt-auto`
  // and the Footer's own `mt-24`) so the footer sits directly below the centered
  // content instead of competing for the free vertical space. Scoped to the
  // dashboard route so an unlogged /activity keeps its sticky footer, and to
  // the non-geo branch: geo-loading/geo-blocked render short content instead of
  // the centered Container, so the footer must keep `mt-auto` to stay at the
  // viewport bottom.
  const { pathname } = useLocation();
  const isDisconnectedLanding =
    !isWalletConnected && pathname === "/" && !isGeoBlocked && !isGeoLoading;
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [initialDepositAmountBtc, setInitialDepositAmountBtc] = useState<
    string | undefined
  >();

  const openDeposit = useCallback((initialAmountBtc?: string) => {
    setInitialDepositAmountBtc(initialAmountBtc);
    setIsDepositOpen(true);
  }, []);

  const closeDeposit = useCallback(() => {
    setIsDepositOpen(false);
    setInitialDepositAmountBtc(undefined);
  }, []);

  // Sidebar-agnostic: rendered unconditionally as the content column's first
  // child (see below). v2/mobile never show the sidebar, so the content
  // column is full-width there and this looks identical to the pre-sidebar
  // layout; on v3 desktop the sidebar is a flex sibling of the content
  // column, not a descendant, so banner height here never pushes the
  // sidebar's `sticky top-0 h-svh` position down or clips its footer.
  const operationalBanners = (
    <>
      <TestingBanner
        visible={!FeatureFlags.isV3UiEnabled && shouldDisplayTestingMsg()}
      />
      {/* Intentionally not gated on `isGeoBlocked`: an operator notice
          describes a service-wide condition and renders in the top banner
          stack (above the geo-block screen), so geo-blocked sessions must
          see it too. */}
      <NoticeBanner
        visible={Boolean(FeatureFlags.noticeBannerMessage)}
        message={FeatureFlags.noticeBannerMessage}
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
        {/* v3 portal target for the critical near-liquidation banner. It lives
            in this wrapper — a sibling ABOVE the sidebar/content row — so the
            red bar spans the entire window width including the side nav, per
            Figma §D / node 10204-45613, and so the wrapper's height measurement
            above covers it too (no second mechanism needed).

            The full-bleed placement is a v3 design change, but the banner
            itself is gated on the liquidation-notifications flag, so the slot is
            flag-switched rather than moved outright: with v3 off it stays where
            it has always been, first child of the content column.
            `isV3UiEnabled` is a build-time constant, so exactly one of the two
            slots exists for the life of the app and neither can be
            unmounted/remounted at runtime — which matters because the consumer
            (`CriticalLiquidationTopBanner`) resolves this node once on mount via
            `getElementById` and holds the reference; a node that came and went
            (e.g. across the 768px `showV3Sidebar` breakpoint) would leave the
            portal silently writing into a detached element. Owned by the
            dashboard (where the Aave data + debug override live) but portaled
            here so it renders above the header and above the deposit-disabled
            banner. */}
        {FeatureFlags.isV3UiEnabled && (
          <div
            id={CRITICAL_BANNER_SLOT_ID}
            className={twJoin("sticky top-0", CRITICAL_BANNER_Z_CLASS)}
          />
        )}
        <div
          className={twJoin("sticky top-0", DEPOSIT_DISABLED_BANNER_Z_CLASS)}
        >
          <DepositDisabledBanner visible={showDepositDisabledBanner} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1">
        {showV3Sidebar && <AppSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          {!FeatureFlags.isV3UiEnabled && <div id={CRITICAL_BANNER_SLOT_ID} />}
          {operationalBanners}
          <Header
            size="md"
            // v3 adds the Figma top-bar divider (border-b) and sits the page
            // content 24px below it (mb-6). v2 keeps the default mb-20.
            className={
              FeatureFlags.isV3UiEnabled
                ? "mb-6 border-b border-secondary-strokeLight"
                : undefined
            }
            // `PAGE_CONTENT_CLASS` carries `!max-w-[1080px]`, overriding the
            // `container` width core-ui's Header applies by default so the navbar
            // shares the same 1080px content box as the page body and footer.
            containerClassName={PAGE_CONTENT_CLASS}
            logo={
              FeatureFlags.isV3UiEnabled ? (
                <Heading
                  variant="h5"
                  as="h1"
                  className="font-normal text-accent-primary"
                >
                  {pageTitle}
                </Heading>
              ) : (
                <BrandLockup />
              )
            }
            mobileLogo={
              <div className="[&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
                <MobileLogo />
              </div>
            }
            navigation={
              FeatureFlags.isV3UiEnabled ? undefined : <DesktopNavigation />
            }
            mobileNavigation={
              FeatureFlags.isV3UiEnabled ? (
                <V3MobileNavigation />
              ) : (
                <MobileNavigation />
              )
            }
            rightActions={
              <div className="flex items-center gap-4">
                {FeatureFlags.isV3UiEnabled && <NetworkBadge />}
                {!FeatureFlags.isV3UiEnabled &&
                  isWalletConnected &&
                  !isDepositOpen &&
                  !isGeoBlocked &&
                  !isAddressBlocked && (
                    <DepositButton
                      data-testid="deposit-button"
                      variant="outlined"
                      rounded
                      disabled={isDepositBlocked(gate)}
                      onClick={() => openDeposit()}
                    >
                      Deposit {btcConfig.coinSymbol}
                    </DepositButton>
                  )}
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
                  the click has a visible recovery path. */}
              <AaveConfigProvider
                errorFallback={
                  <FullScreenDialog
                    open={isDepositOpen}
                    onClose={closeDeposit}
                    className="items-center justify-center p-6"
                  >
                    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 text-center">
                      <Text variant="body1" className="font-medium">
                        {COPY.common.somethingWentWrong.heading}
                      </Text>
                      <Text variant="body2" className="text-accent-secondary">
                        {COPY.common.somethingWentWrong.body}
                      </Text>
                    </div>
                  </FullScreenDialog>
                }
              >
                <SimpleDeposit
                  open={isDepositOpen}
                  onClose={closeDeposit}
                  initialAmountBtc={initialDepositAmountBtc}
                />
              </AaveConfigProvider>
            </ActivatingVaultsProvider>
          )}
          {!FeatureFlags.isV3UiEnabled && (
            <div className={isDisconnectedLanding ? "mt-0" : "mt-auto"}>
              {/* The footer bar background is full-bleed, and per Figma its content is too:
                  the social/copyright block's left edge lines up with the navbar/body's
                  1080px `PAGE_CONTENT_CLASS` box, but the logo sits close to the true
                  viewport edge rather than being boxed into that same 1080px cap.
                  `[&>div]:!max-w-none` drops the Footer's default `container` cap so the
                  row can span the full width; `[&>div]:!px-5` keeps the page's standard
                  20px edge inset on the left (and on the right below `md`).
                  `[&>div]:md:!pr-[90px]` widens the right inset at `md`+ to match Figma's
                  footer-specific right margin exactly. `FOOTER_SOCIAL_MARGIN_CLASS` (passed
                  via `socialClassName`) pushes the social block in from the left edge by the
                  same amount the 1080px box is inset at the current viewport width, so it
                  lines up with the navbar/body starting point instead of the raw edge.
                  `!bg-secondary-main` + `before:!bg-secondary-main` swap the light-
                  mode background (and its decorative top-edge pseudo) from the
                  default teal to brand orange; dark mode keeps `primary-main`.
                  Only rendered in v2 — the v3 Figma frame has no page-level footer at
                  all (confirmed via Dev Mode MCP metadata on node 10084:22951): the
                  sidebar's own bottom block (social + Terms/Privacy) fully replaces it. */}
              <Footer
                socialLinks={FOOTER_SOCIAL_LINKS}
                copyrightYear={new Date().getFullYear()}
                className={twJoin(
                  "!bg-secondary-main before:!bg-secondary-main dark:!bg-primary-main dark:before:!bg-primary-main [&>div]:!max-w-none [&>div]:!px-5 [&>div]:md:!pr-[90px]",
                  // Override the Footer's baked-in `mt-24` on the disconnected landing.
                  isDisconnectedLanding && "!mt-0",
                )}
                socialClassName={FOOTER_SOCIAL_MARGIN_CLASS}
              />
            </div>
          )}
          {FeatureFlags.isV3UiEnabled && isMobileView && (
            // v3 has no page-level footer on desktop (the sidebar's own
            // bottom block covers it) but mobile has no sidebar at all, and
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
