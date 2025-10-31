import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  StandardSettingsMenu,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { Connect } from "../Wallet";

export default function RootLayout() {
  const isMobile = useIsMobile();
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={twJoin(
        "relative h-full min-h-svh w-full",
        !isMobile
          ? "dark:app-bg app-bg bg-cover bg-fixed bg-center bg-no-repeat"
          : "",
      )}
    >
      <div className="flex min-h-svh flex-col">
        <Header
          size="sm"
          rightActions={
            <div className="flex items-center gap-2">
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
