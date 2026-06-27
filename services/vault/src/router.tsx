import { Loader } from "@babylonlabs-io/core-ui";
import { Suspense, useEffect } from "react";
import { Route, Routes } from "react-router";

import { AAVE_APP_ID } from "./applications/aave/config";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
  ReorderOverrideProvider,
  ReserveDetailModalProvider,
  useReserveDetailModal,
} from "./applications/aave/context";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const Activity = lazyWithRetry(() => import("./components/pages/Activity"));
const DashboardPage = lazyWithRetry(() =>
  import("./components/simple/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

// Rendered inside ReserveDetailModalSlot — opening it never unmounts the
// dashboard underneath.
const importAaveReserveDetail = () =>
  import("./applications/aave/components/Detail");
const AaveReserveDetail = lazyWithRetry(() =>
  importAaveReserveDetail().then((m) => ({ default: m.AaveReserveDetail })),
);

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader />
  </div>
);

/**
 * Renders the borrow/repay reserve-detail modal when one is open, else nothing.
 * Sibling of the dashboard so opening it never unmounts the page underneath.
 * Suspense fallback is null on purpose: the (lazy) detail chunk loads with the
 * dashboard fully visible instead of flashing a loader.
 */
const ReserveDetailModalSlot = () => {
  const { activeReserve, closeReserveDetail } = useReserveDetailModal();
  if (!activeReserve) return null;
  return (
    <AaveReserveDetail
      reserveSymbol={activeReserve.reserveSymbol}
      tab={activeReserve.tab}
      onRequestClose={closeReserveDetail}
    />
  );
};

/**
 * Dashboard + its Aave providers + the borrow/repay modal slot, mounted once at
 * the index route. The modal renders as a sibling overlay over the still-mounted
 * dashboard. Replaces the former route-overlay layout now that borrow/repay are
 * modals rather than deep-linkable routes.
 */
const DashboardWithProviders = () => {
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
          <ReserveDetailModalProvider>
            <Suspense fallback={<RouteFallback />}>
              <DashboardPage />
            </Suspense>
            <Suspense fallback={null}>
              <ReserveDetailModalSlot />
            </Suspense>
          </ReserveDetailModalProvider>
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
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<DashboardWithProviders />} />
        <Route
          path="activity"
          element={
            <Suspense fallback={<RouteFallback />}>
              <ActivityWithProviders />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
