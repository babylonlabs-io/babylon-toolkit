import { Route, Routes } from "react-router";

import { AaveReserveDetail } from "./components/Detail";
import { AaveOverview } from "./components/Overview";
import { AaveConfigProvider, PendingVaultsProvider } from "./context";

const AAVE_APP_ID = "aave";

export function AaveRoutes() {
  return (
    <AaveConfigProvider>
      <PendingVaultsProvider appId={AAVE_APP_ID}>
        <Routes>
          <Route index element={<AaveOverview />} />
          <Route path="reserve/:reserveId" element={<AaveReserveDetail />} />
        </Routes>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
}
