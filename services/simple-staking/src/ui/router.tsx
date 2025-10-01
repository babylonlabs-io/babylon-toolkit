import { Navigate, Route, Routes } from "react-router";
import { VaultLayout } from "@routes/vault";

import BabyLayout from "./baby/layout";
import Layout from "./common/layout";
import NotFound from "./common/not-found";
import BTCStaking from "./common/page";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="vault" replace />} />
        <Route path="vault" element={<VaultLayout />} />
        <Route path="btc" element={<BTCStaking />} />
        <Route path="baby" element={<BabyLayout />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
