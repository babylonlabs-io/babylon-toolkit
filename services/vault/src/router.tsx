import { Route, Routes } from "react-router";

import Layout from "./components/layouts/layout";
import { MarketDetail as MarketDetailPage } from "./components/MarketDetail";
import NotFound from "./components/pages/not-found";
import { VaultLayout } from "./components/pages/VaultLayout";

export const Router = () => {
  return (
    <Routes>
      <Route path="/vault" element={<Layout />}>
        <Route index element={<VaultLayout />} />
        <Route path="market/:marketId" element={<MarketDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
