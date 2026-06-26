import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  FullScreenDialog,
  Header,
  Loader,
  MobileLogo,
  Nav,
  SmallLogo,
  StandardSettingsMenu,
  TestingBanner,
  Text,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
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
import { ProtocolPauseBanner } from "../shared/ProtocolPauseBanner";
import {
  isDepositBlocked,
  resolveProtocolPauseLevel,
} from "../shared/protocolPauseLevel";
import SimpleDeposit from "../simple/SimpleDeposit";
import { Connect } from "../Wallet";

export interface RootLayoutContext {
  openDeposit: (initialAmountBtc?: string) => void;
}

const btcConfig = getNetworkConfigBTC();

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
        {/* Deposit kill-switch banner. Suppressed when a pause banner is active,
            since the pause card already explains the disabled state. */}
        <DepositDisabledBanner
          visible={
            !isGeoBlocked &&
            isWalletConnected &&
            FeatureFlags.isDepositDisabled &&
            resolveProtocolPauseLevel() === null
          }
        />
        <Header
          size="md"
          // `!max-w-` overrides the `container` class's 2xl breakpoint max-width
          // (1536px) that core-ui's Header applies by default, so the navbar is
          // actually capped at 1400px on wide viewports.
          containerClassName={`${PAGE_CONTENT_CLASS} !max-w-[1400px]`}
          // Tint the logo brand-orange in light mode; keep the default
          // light-on-dark contrast in dark mode. The wrapper's `[&_svg]` selector
          // overrides the SVG's hardcoded `text-accent-primary` color, which the
          // paths inherit through `fill-current`.
          logo={
            <div className="[&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
              <SmallLogo />
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
                    variant="outlined"
                    rounded
                    disabled={isDepositBlocked()}
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
            <ProtocolPauseBanner />
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
          {/* `[&>div]:!max-w-[1400px]` caps the Footer's inner Container at
              1400px, overriding the `container` class's 1536px max-width at
              the 2xl breakpoint so the footer aligns with the navbar.
              `[&>div]:!px-5` restores the 20px horizontal inset that core-ui's
              Container drops at the `sm` breakpoint (`sm:px-0`), matching the
              navbar/page `PAGE_CONTENT_CLASS` padding so the footer content
              lines up with the rest of the page chrome.
              `!bg-secondary-main` + `before:!bg-secondary-main` swap the light-
              mode background (and its decorative top-edge pseudo) from the
              default teal to brand orange; dark mode keeps `primary-main`. */}
          <Footer
            socialLinks={DEFAULT_SOCIAL_LINKS}
            copyrightYear={new Date().getFullYear()}
            className="!bg-secondary-main before:!bg-secondary-main dark:!bg-primary-main dark:before:!bg-primary-main [&>div]:!max-w-[1400px] [&>div]:!px-5"
          />
        </div>
      </div>
    </div>
  );
}
