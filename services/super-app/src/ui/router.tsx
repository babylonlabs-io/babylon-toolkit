import { Navigate, Route, Routes } from "react-router";

import Layout from "./common/layout";
import NotFound from "./common/not-found";
import { StakingRoutes } from "./staking/routes";
import { VaultRoutes } from "./vault/routes";

export const Router = () => {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="btc" replace />} />
                <Route path="btc" element={<StakingRoutes />} />
                <Route path="baby" element={<StakingRoutes />} />
                <Route path="rewards" element={<StakingRoutes />} />
                <Route path="vault/*" element={<VaultRoutes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

