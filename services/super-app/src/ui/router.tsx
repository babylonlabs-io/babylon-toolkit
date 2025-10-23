import { Navigate, Route, Routes } from "react-router";

import NotFound from "./common/not-found";
import { StakingApp } from "./staking/StakingApp";
import { VaultApp } from "./vault/VaultApp";

export const Router = () => {
    return (
        <Routes>
            <Route index element={<Navigate to="btc" replace />} />
            <Route path="btc/*" element={<StakingApp />} />
            <Route path="baby/*" element={<StakingApp />} />
            <Route path="rewards/*" element={<StakingApp />} />
            <Route path="vault/*" element={<VaultApp />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

