import { Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { getAllApplications } from "./applications";
import { AAVE_APP_ID } from "./applications/aave/config";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
} from "./applications/aave/context";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

const Activity = lazy(() => import("./components/pages/Activity"));
const ApplicationsHome = lazy(
  () => import("./components/pages/ApplicationsHome"),
);
const DashboardPage = lazy(() =>
  import("./components/simple/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader />
  </div>
);

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
        <Route
          index
          element={
            <Suspense fallback={<RouteFallback />}>
              <DashboardWithProviders />
            </Suspense>
          }
        />
        <Route
          path="activity"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Activity />
            </Suspense>
          }
        />
        <Route
          path="deposit"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ApplicationsHome />
            </Suspense>
          }
        />
        {apps.map((app) => (
          <Route
            key={app.metadata.id}
            path={`app/${app.metadata.id}/*`}
            element={
              <Suspense fallback={<RouteFallback />}>
                <app.Routes />
              </Suspense>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
