import { Route, Routes } from "react-router";

import { MarketDetail as MarketDetailPage } from "./components/Market/Detail";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import Deposit from "./components/pages/Deposit";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<ApplicationsHome />} />
        <Route path="deposit" element={<Deposit />} />
        <Route path="market/:marketId" element={<MarketDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
