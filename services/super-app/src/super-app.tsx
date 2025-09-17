import { Navigate, Route, Routes } from "react-router";

import { Footer } from "./components/Footer/Footer";
import { Header } from "./components/Header/Header";
import Providers from "@services/simple-staking/src/ui/common/providers";
import { SimpleStakingApp } from "@services/simple-staking/src/embedded";
import FF from "@services/simple-staking/src/ui/common/utils/FeatureFlagService";

import { VaultApp } from "@services/vault/src";

export function SuperApp() {
    return (
        <div className="relative h-full min-h-svh w-full">
            <Providers>
                <div className="flex min-h-svh flex-col">
                    <Header />
                    <Routes>
                        <Route index element={<Navigate to="/btc" replace />} />
                        {FF.IsVaultEnabled && (
                            <Route path="vault/*" element={<VaultApp />} />
                        )}
                        <Route path="*" element={<SimpleStakingApp />} />
                    </Routes>
                    <div className="mt-auto">
                        <Footer />
                    </div>
                </div>
            </Providers>
        </div>
    );
}




