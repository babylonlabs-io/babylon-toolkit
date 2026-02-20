import { Route, Routes } from "react-router";

import { getAllApplications } from "./applications";
import { AAVE_APP_ID } from "./applications/aave/config";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
} from "./applications/aave/context";
import Activity from "./components/pages/Activity";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";
import { DashboardPage } from "./components/simple/DashboardPage";

// TODO: Remove Aave provider wrappers once dashboard routing is finalized
const DashboardWithProviders = () => (
  <AaveConfigProvider>
    <PendingVaultsProvider appId={AAVE_APP_ID}>
      <DashboardPage />
    </PendingVaultsProvider>
  </AaveConfigProvider>
);

export const Router = () => {
  const apps = getAllApplications();

  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        {/* deprecated route */}
        {/* <Route index element={<ApplicationsHome />} /> */}
        <Route index element={<DashboardWithProviders />} />
        <Route path="activity" element={<Activity />} />
        <Route path="deposit" element={<ApplicationsHome />} />

        {apps.map((app) => (
          <Route
            key={app.metadata.id}
            path={`app/${app.metadata.id}/*`}
            element={<app.Routes />}
          />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
