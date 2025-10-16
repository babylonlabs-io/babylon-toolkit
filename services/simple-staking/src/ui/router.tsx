import { Navigate, Route, Routes } from "react-router";

import VaultLayout from "./vault/layout";
import Layout from "./common/layout";
import NotFound from "./common/not-found";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="vault" replace />} />
        <Route path="vault" element={<VaultLayout />} />
        {/* <Route path="btc" element={<BTCStaking />} />
        <Route path="baby" element={<BabyLayout />} /> */}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
