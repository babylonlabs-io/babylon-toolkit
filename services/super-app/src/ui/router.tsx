import { Route, Routes } from "react-router";

import { SharedLayout } from "./common/SharedLayout";
import NotFound from "./common/not-found";
import { StakingApp } from "./staking/StakingApp";
import { VaultApp } from "./vault/VaultApp";

export const Router = () => {
    return (
        <Routes>
            <Route element={<SharedLayout />}>
                <Route path="/vault/*" element={<VaultApp />} />
                <Route path="/*" element={<StakingApp />} />
            </Route>
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

