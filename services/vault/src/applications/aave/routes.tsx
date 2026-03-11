import { Route, Routes } from "react-router";

import { AaveReserveDetail } from "./components/Detail";
import { AAVE_APP_ID } from "./config";
import { AaveConfigProvider, PendingVaultsProvider } from "./context";

export function AaveRoutes() {
  return (
    <AaveConfigProvider>
      <PendingVaultsProvider appId={AAVE_APP_ID}>
        <Routes>
          <Route path="reserve/:reserveId" element={<AaveReserveDetail />} />
        </Routes>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
}
