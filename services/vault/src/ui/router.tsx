import { VaultLayout } from "./vault/VaultLayout";
import { MarketDetail as MarketDetailPage } from "./vault/components/MarketDetail";
import { Route, Routes } from "react-router";

import Layout from "./common/layout";
import NotFound from "./common/not-found";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<VaultLayout />} />
        <Route path="market/:marketId" element={<MarketDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
