import {
  Footer,
  FullScreenDialog,
  Header,
  Loader,
  MobileLogo,
  Nav,
  SmallLogo,
  type SocialLink,
  StandardSettingsMenu,
  TestingBanner,
  Text,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
import { BsDiscord, BsGithub, BsLinkedin } from "react-icons/bs";
import { FaXTwitter } from "react-icons/fa6";
import { NavLink, Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { DepositButton } from "@/components/shared";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
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

  const isWalletConnected = btcConnected && ethConnected;
  const showAddressTypeBanner = isWalletConnected && !isSupportedAddress;
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

  return (
    <div className="relative h-full min-h-svh w-full bg-surface">
      <div className="flex min-h-svh flex-col">
        {/* Portal target for the critical near-liquidation banner. Owned by the
            dashboard (where the Aave data + debug override live) but portaled
            here so it renders above the header, atop the operational banners. */}
        <div id={CRITICAL_BANNER_SLOT_ID} />
        <TestingBanner visible={shouldDisplayTestingMsg()} />
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
        {/* Deposit kill-switch banner. Suppressed when a frozen/paused status
            banner is active, since that banner already explains the disabled
            state. */}
        <DepositDisabledBanner
          visible={
            !isGeoBlocked &&
            isWalletConnected &&
            FeatureFlags.isDepositDisabled &&
            resolveBannerStatus(gate) === null
          }
        />
        <Header
          size="md"
          // `PAGE_CONTENT_CLASS` carries `!max-w-[1080px]`, overriding the
          // `container` width core-ui's Header applies by default so the navbar
          // shares the same 1080px content box as the page body and footer.
          containerClassName={PAGE_CONTENT_CLASS}
          // Tint the logo brand-orange in light mode; keep the default
          // light-on-dark contrast in dark mode. The wrapper's `[&_svg]` selector
          // overrides the SVG's hardcoded `text-accent-primary` color, which the
          // paths inherit through `fill-current`.
          logo={
            <div className="flex items-center gap-3">
              <div className="[&_svg]:!h-8 [&_svg]:!w-auto [&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
                <SmallLogo />
              </div>
              <div className="h-8 w-px bg-secondary-strokeLight" />
              <img
                src="/images/aave-wordmark.svg"
                alt="Aave"
                className="h-[18px] w-[109px]"
              />
            </div>
          }
          mobileLogo={
            <div className="[&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
              <MobileLogo />
            </div>
          }
          navigation={<DesktopNavigation />}
          mobileNavigation={<MobileNavigation />}
          rightActions={
            <div className="flex items-center gap-4">
              {isWalletConnected &&
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
        <div className="mt-auto">
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
              default teal to brand orange; dark mode keeps `primary-main`. */}
          <Footer
            socialLinks={FOOTER_SOCIAL_LINKS}
            copyrightYear={new Date().getFullYear()}
            className="!bg-secondary-main before:!bg-secondary-main dark:!bg-primary-main dark:before:!bg-primary-main [&>div]:!max-w-none [&>div]:!px-5 [&>div]:md:!pr-[90px]"
            socialClassName={FOOTER_SOCIAL_MARGIN_CLASS}
          />
        </div>
      </div>
    </div>
  );
}
