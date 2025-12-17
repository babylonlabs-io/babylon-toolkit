import { Route, Routes } from "react-router";

import { AaveReserveDetail } from "./components/Detail";
import { AaveOverview } from "./components/Overview";
import { AaveConfigProvider, PendingVaultsProvider } from "./context";

export function AaveRoutes() {
  return (
    <AaveConfigProvider>
      <PendingVaultsProvider>
        <Routes>
          <Route index element={<AaveOverview />} />
          <Route path="reserve/:reserveId" element={<AaveReserveDetail />} />
        </Routes>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
}
