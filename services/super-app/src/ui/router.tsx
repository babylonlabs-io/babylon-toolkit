import { Route, Routes } from "react-router";

import { StakingApp } from "./staking/StakingApp";
import { VaultApp } from "./vault/VaultApp";

export const Router = () => {
    return (
        <Routes>
            <Route path="/vault/*" element={<VaultApp />} />
            <Route path="/*" element={<StakingApp />} />
        </Routes>
    );
};

