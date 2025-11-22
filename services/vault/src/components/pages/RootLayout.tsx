import {
  Button,
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  StandardSettingsMenu,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { Outlet, useLocation, useNavigate } from "react-router";
import { twJoin } from "tailwind-merge";

import { useBTCWallet, useETHWallet } from "../../context/wallet";
import { Connect } from "../Wallet";

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
          rightActions={
            <div className="flex items-center gap-4">
              {isWalletConnected && !isDepositPage && (
                <Button
                  variant="outlined"
                  rounded
                  onClick={() => navigate("/deposit")}
                >
                  Deposit
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
