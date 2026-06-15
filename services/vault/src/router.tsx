import { Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense, useEffect } from "react";
import { Outlet, Route, Routes } from "react-router";

import { getAllApplications } from "./applications";
import { AAVE_APP_ID } from "./applications/aave/config";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
  ReorderOverrideProvider,
} from "./applications/aave/context";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

const Activity = lazy(() => import("./components/pages/Activity"));
const DashboardPage = lazy(() =>
  import("./components/simple/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

// Rendered as a full-screen overlay over the persistent dashboard (see
// AaveOverlayLayout), so opening it never unmounts the page underneath.
const importAaveReserveDetail = () =>
  import("./applications/aave/components/Detail");
const AaveReserveDetail = lazy(() =>
  importAaveReserveDetail().then((m) => ({ default: m.AaveReserveDetail })),
);

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader />
  </div>
);

/**
 * Hosts the Aave providers and the dashboard once and keeps both mounted across
 * "/" and "/app/aave/reserve/:reserveId". The reserve detail renders into the
 * <Outlet/> as a full-screen overlay on top of the still-mounted dashboard, so
 * navigating to it never blanks the page — no route swap, no provider refetch.
 * The outlet's fallback is null on purpose: while the (lazy) detail chunk loads
 * the dashboard stays fully visible underneath instead of flashing a loader.
 */
const AaveOverlayLayout = () => {
  // Warm the reserve-detail chunk once the dashboard is idle so the first open
  // is instant rather than waiting on the lazy import.
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => {
        void importAaveReserveDetail();
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => {
      void importAaveReserveDetail();
    }, 200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <AaveConfigProvider>
      <PendingVaultsProvider appId={AAVE_APP_ID}>
        <ReorderOverrideProvider>
          <Suspense fallback={<RouteFallback />}>
            <DashboardPage />
          </Suspense>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </ReorderOverrideProvider>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
};

const ActivityWithProviders = () => (
  <AaveConfigProvider>
    <Activity />
  </AaveConfigProvider>
);

export const Router = () => {
  const apps = getAllApplications().filter((app) => app.Routes);

  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route element={<AaveOverlayLayout />}>
          <Route index element={null} />
          <Route
            path={`app/${AAVE_APP_ID}/reserve/:reserveId`}
            element={<AaveReserveDetail />}
          />
        </Route>
        <Route
          path="activity"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ActivityWithProviders />
            </Suspense>
          }
        />
        {apps.map((app) => {
          const AppRoutes = app.Routes;
          return (
            <Route
              key={app.metadata.id}
              path={`app/${app.metadata.id}/*`}
              element={
                <Suspense fallback={<RouteFallback />}>
                  {AppRoutes ? <AppRoutes /> : null}
                </Suspense>
              }
            />
          );
        })}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
