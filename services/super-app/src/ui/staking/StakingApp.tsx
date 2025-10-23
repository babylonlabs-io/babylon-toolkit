import { Navigate, Route, Routes } from "react-router";
import BabyLayout from "@services/simple-staking/ui/baby/layout";
import BTCStaking from "@services/simple-staking/ui/common/page";
import RewardsPage from "@services/simple-staking/ui/common/rewards";

export const StakingApp = () => {
    return (
        <Routes>
            <Route index element={<Navigate to="/btc" replace />} />
            <Route path="btc" element={<BTCStaking />} />
            <Route path="baby" element={<BabyLayout />} />
            <Route path="rewards" element={<RewardsPage />} />
        </Routes>
    );
};

