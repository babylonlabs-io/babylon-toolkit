import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";
import { useIsMobile, WaveBackground } from "@babylonlabs-io/core-ui";

import { network } from "@/ui/common/config/network/btc";
import { Network } from "@/ui/common/types/network";
import "@/ui/globals.css";

import { Banner } from "./components/Banner/Banner";
import { CoStakingBanner } from "./components/CoStakingBanner";
import { Footer } from "./components/Footer/Footer";
import { Header } from "./components/Header/Header";
import FF from "./utils/FeatureFlagService";

export default function RootLayout() {
  const isMobile = useIsMobile();

  return (
    <div
      className={twJoin(
        `relative h-full min-h-svh w-full`,
        network === Network.MAINNET ? "main-app-mainnet" : "main-app-testnet",
      )}
    >
      <WaveBackground
        className="absolute inset-0 -z-10"
        waveCount={5}
        colors={["rgba(255, 124, 42, 0.3)", "rgba(13, 183, 191, 0.3)", "rgba(255, 124, 42, 0.2)"]}
        strokeWidth={2}
        speed={0.0005}
        amplitude={0.15}
        frequency={0.8}
      />
      <div className="flex min-h-svh flex-col">
        <Banner />
        {FF.IsCoStakingEnabled && <CoStakingBanner />}
        <Header />

        <Outlet />

        <div className="mt-auto">
          <Footer />
        </div>
      </div>
    </div>
  );
}
