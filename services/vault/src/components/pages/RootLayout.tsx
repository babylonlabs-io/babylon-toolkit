import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  FullScreenDialog,
  Header,
  Nav,
  StandardSettingsMenu,
  TestingBanner,
  Text,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC, shouldDisplayTestingMsg } from "@/config";
import { useAddressScreening } from "@/context/addressScreening";
import { useAddressType } from "@/context/addressType";
import { useGeoFencing } from "@/context/geofencing";

import { AaveConfigProvider } from "../../applications/aave/context";
import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { AddressScreeningBanner } from "../shared/AddressScreeningBanner";
import { AddressTypeBanner } from "../shared/AddressTypeBanner";
import { GeoBlockBanner } from "../shared/GeoBlockBanner";
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
      <AppNavLink to="/">Applications</AppNavLink>
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
      <AppNavLink to="/">Applications</AppNavLink>
      <AppNavLink to="/activity">Activity</AppNavLink>
    </div>
  );
}

export default function RootLayout() {
  const { theme, setTheme } = useTheme();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();
  const { isGeoBlocked } = useGeoFencing();
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
        <TestingBanner visible={shouldDisplayTestingMsg()} />
        <GeoBlockBanner visible={isGeoBlocked} />
        <AddressScreeningBanner
          visible={isWalletConnected && isAddressBlocked}
        />
        <AddressTypeBanner visible={showAddressTypeBanner} />
        <Header
          size="sm"
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
                  Something went wrong
                </Text>
                <Text variant="body2" className="text-accent-secondary">
                  Please close this and try again in a moment.
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
        <div className="mt-auto">
          <Footer
            socialLinks={DEFAULT_SOCIAL_LINKS}
            copyrightYear={new Date().getFullYear()}
          />
        </div>
      </div>
    </div>
  );
}
