import { Navigate, Route, Routes } from "react-router";
import { VaultLayout } from "@routes/vault";

import BabyLayout from "./baby/layout";
import Layout from "./common/layout";
import NotFound from "./common/not-found";
import BTCStaking from "./common/page";
import FeatureFlagService from "./common/utils/FeatureFlagService";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="btc" replace />} />
        <Route path="btc" element={<BTCStaking />} />
        {FeatureFlagService.IsBabyStakingEnabled && (
          <Route path="baby" element={<BabyLayout />} />
        )}
        {FeatureFlagService.IsVaultEnabled && (
          <Route path="vault" element={<VaultLayout />} />
        )}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
