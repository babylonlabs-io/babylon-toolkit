import { Route, Routes } from "react-router";

import { getEnabledApplications } from "./applications";
import { MarketDetail as MarketDetailPage } from "./components/Market/Detail";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import Deposit from "./components/pages/Deposit";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

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

        <Route path="market/:marketId" element={<MarketDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
