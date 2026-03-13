import { Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { AAVE_APP_ID } from "./config";
import { AaveConfigProvider, PendingVaultsProvider } from "./context";

const AaveReserveDetail = lazy(() =>
  import("./components/Detail").then((m) => ({
    default: m.AaveReserveDetail,
  })),
);

export function AaveRoutes() {
  return (
    <AaveConfigProvider>
      <PendingVaultsProvider appId={AAVE_APP_ID}>
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <Loader />
            </div>
          }
        >
          <Routes>
            <Route path="reserve/:reserveId" element={<AaveReserveDetail />} />
          </Routes>
        </Suspense>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
}
