import { Route, Routes } from "react-router";

import { AaveMarketDetail } from "./components/Detail";
import { AaveOverview } from "./components/Overview";

export function AaveRoutes() {
  return (
    <Routes>
      <Route index element={<AaveOverview />} />
      <Route path="market/:marketId" element={<AaveMarketDetail />} />
    </Routes>
  );
}
