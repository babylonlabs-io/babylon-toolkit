import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";
import { useIsMobile } from "@babylonlabs-io/core-ui";

import { network } from "@/ui/common/config/network/btc";
import { Network } from "@/ui/common/types/network";
import "@/ui/globals.css";

import { Banner } from "./components/Banner/Banner";
import { Footer } from "./components/Footer/Footer";
import { Header } from "./components/Header/Header";

export default function RootLayout() {
  const isMobile = useIsMobile();

  return (
    <div
      className={twJoin(
        `relative h-full min-h-svh w-full`,
        network === Network.MAINNET ? "main-app-mainnet" : "main-app-testnet",
        !isMobile
          ? `dark:app-bg app-bg bg-cover bg-fixed bg-center bg-no-repeat`
          : "",
      )}
    >
      <div className="flex min-h-svh flex-col">
        <Banner />
        <Header />

        <Outlet />

        <div className="mt-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}
