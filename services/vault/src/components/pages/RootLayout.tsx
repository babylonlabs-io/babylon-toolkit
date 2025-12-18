import {
  Button,
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  Nav,
  StandardSettingsMenu,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { twJoin } from "tailwind-merge";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { Connect } from "../Wallet";

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
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();
  const { connected: btcConnected } = useBTCWallet();
  const { connected: ethConnected } = useETHWallet();

  const isWalletConnected = btcConnected && ethConnected;
  const isDepositPage = location.pathname === "/deposit";

  return (
    <div
      className={twJoin(
        "relative h-full min-h-svh w-full",
        "dark:app-bg app-bg bg-cover bg-center bg-no-repeat",
        !isMobile ? "bg-fixed" : "",
      )}
    >
      <div className="flex min-h-svh flex-col">
        <Header
          size="sm"
          navigation={<DesktopNavigation />}
          mobileNavigation={<MobileNavigation />}
          rightActions={
            <div className="flex items-center gap-4">
              {isWalletConnected && !isDepositPage && (
                <Button
                  variant="outlined"
                  rounded
                  onClick={() => navigate("/deposit")}
                >
                  Deposit BTC
                </Button>
              )}
              <Connect />
              <StandardSettingsMenu theme={theme} setTheme={setTheme} />
            </div>
          }
        />
        <Outlet />
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
