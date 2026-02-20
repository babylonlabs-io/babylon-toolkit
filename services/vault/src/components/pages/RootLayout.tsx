import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  Nav,
  StandardSettingsMenu,
  TestingBanner,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { DepositButton } from "@/components/shared";
import { getNetworkConfigBTC, shouldDisplayTestingMsg } from "@/config";
import { useAddressType } from "@/context/addressType";
import { useGeoFencing } from "@/context/geofencing";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { AddressTypeBanner } from "../shared/AddressTypeBanner";
import { GeoBlockBanner } from "../shared/GeoBlockBanner";
import SimpleDeposit from "../simple/SimpleDeposit";
import { Connect } from "../Wallet";

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
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();
  const { isGeoBlocked } = useGeoFencing();
  const { isSupportedAddress } = useAddressType();

  const isWalletConnected = btcConnected && ethConnected;
  const showAddressTypeBanner = isWalletConnected && !isSupportedAddress;
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  return (
    <div
      className={twJoin(
        "relative h-full min-h-svh w-full",
        "dark:app-bg app-bg bg-cover bg-center bg-no-repeat",
        !isMobile ? "bg-fixed" : "",
      )}
    >
      <div className="flex min-h-svh flex-col">
        <TestingBanner visible={shouldDisplayTestingMsg()} />
        <GeoBlockBanner visible={isGeoBlocked} />
        <AddressTypeBanner visible={showAddressTypeBanner} />
        <Header
          size="sm"
          navigation={<DesktopNavigation />}
          mobileNavigation={<MobileNavigation />}
          rightActions={
            <div className="flex items-center gap-4">
              {isWalletConnected && !isDepositOpen && !isGeoBlocked && (
                <DepositButton
                  variant="outlined"
                  rounded
                  onClick={() => setIsDepositOpen(true)}
                >
                  Deposit {btcConfig.coinSymbol}
                </DepositButton>
              )}
              <Connect />
              <StandardSettingsMenu theme={theme} setTheme={setTheme} />
            </div>
          }
        />
        <Outlet />
        <SimpleDeposit
          open={isDepositOpen}
          onClose={() => setIsDepositOpen(false)}
        />
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
