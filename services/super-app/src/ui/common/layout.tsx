import { Outlet } from "react-router";
import { twJoin } from "tailwind-merge";
import { useIsMobile } from "@babylonlabs-io/core-ui";

import { network } from "@services/simple-staking/ui/common/config/network/btc";
import { Network } from "@services/simple-staking/ui/common/types/network";

import { Banner } from "@services/simple-staking/ui/common/components/Banner/Banner";
import { CoStakingBanner } from "@services/simple-staking/ui/common/components/CoStakingBanner";
import { Footer } from "@services/simple-staking/ui/common/components/Footer/Footer";
import { Header } from "@services/simple-staking/ui/common/components/Header/Header";
import FF from "@services/simple-staking/ui/common/utils/FeatureFlagService";

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

