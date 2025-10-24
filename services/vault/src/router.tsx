import { Route, Routes } from "react-router";

import Layout from "./components/layouts/layout";
import NotFound from "./components/pages/not-found";
import { VaultLayout } from "./components/pages/VaultLayout";
import { MarketDetail as MarketDetailPage } from "./components/MarketDetail";

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
