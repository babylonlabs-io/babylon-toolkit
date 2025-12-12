import { Route, Routes } from "react-router";

import { AaveMarketDetail } from "./components/Detail";

export function AaveRoutes() {
  return (
    <Routes>
      <Route index element={<AaveMarketDetail />} />
    </Routes>
  );
}
