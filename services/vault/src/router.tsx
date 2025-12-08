import { Navigate, Route, Routes, useParams } from "react-router";

import { getEnabledApplications, isApplicationEnabled } from "./applications";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import Deposit from "./components/pages/Deposit";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

function LegacyMarketRedirect() {
  const { marketId } = useParams<{ marketId: string }>();

  if (!isApplicationEnabled("morpho")) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/app/morpho/market/${marketId}`} replace />;
}

export const Router = () => {
  const enabledApps = getEnabledApplications();

  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<ApplicationsHome />} />
        <Route path="deposit" element={<Deposit />} />

        {enabledApps.map((app) => (
          <Route
            key={app.metadata.id}
            path={`app/${app.metadata.id}/*`}
            element={<app.Routes />}
          />
        ))}

        <Route path="market/:marketId" element={<LegacyMarketRedirect />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
