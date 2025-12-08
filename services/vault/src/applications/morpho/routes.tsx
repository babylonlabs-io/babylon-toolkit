import { Route, Routes } from "react-router";

import { MarketDetail } from "./components/Detail";

export function MorphoRoutes() {
  return (
    <Routes>
      <Route path="market/:marketId" element={<MarketDetail />} />
    </Routes>
  );
}
