import {
  DEFAULT_SOCIAL_LINKS,
  Footer,
  Header,
  useIsMobile,
} from "@babylonlabs-io/core-ui";
import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";

import { Connect } from "../Wallet";

export default function RootLayout() {
  const isMobile = useIsMobile();

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
        <Header size="sm" rightActions={<Connect />} />
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
