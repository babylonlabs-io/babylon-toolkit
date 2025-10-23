import { Navigate, Route, Routes, useLocation } from "react-router";
import BabyLayout from "@services/simple-staking/ui/baby/layout";
import BTCStaking from "@services/simple-staking/ui/common/page";
import RewardsPage from "@services/simple-staking/ui/common/rewards";

export const StakingRoutes = () => {
    const location = useLocation();
    const pathSegment = location.pathname.split("/")[1];

    // Return the appropriate route based on the path segment
    if (pathSegment === "baby") {
        return <BabyLayout />;
    }
    if (pathSegment === "rewards") {
        return <RewardsPage />;
    }
    if (pathSegment === "btc") {
        return <BTCStaking />;
    }

    // Default to btc staking
    return <BTCStaking />;
};

