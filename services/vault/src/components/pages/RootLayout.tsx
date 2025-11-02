import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  StandardSettingsMenu,
} from "@babylonlabs-io/core-ui";
import { useTheme } from "next-themes";
import { Outlet } from "react-router";

import { DynamicBackground } from "../DynamicBackground";
import { Connect } from "../Wallet";

export default function RootLayout() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="relative h-full min-h-svh w-full">
      <DynamicBackground />
      <div className="relative z-10 flex min-h-svh flex-col">
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
