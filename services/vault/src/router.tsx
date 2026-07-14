import { Loader } from "@babylonlabs-io/core-ui";
import { Suspense, useEffect } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useOutletContext,
  useSearchParams,
} from "react-router";

import featureFlags from "@/config/featureFlags";
import { V3_GUARDED_ROUTE_PATHS } from "@/config/v3Navigation";

import { AAVE_APP_ID } from "./applications/aave/config";
import { LOAN_TAB } from "./applications/aave/constants";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
  ReorderOverrideProvider,
} from "./applications/aave/context";
import NotFound from "./components/pages/not-found";
import RootLayout, {
  type RootLayoutContext,
} from "./components/pages/RootLayout";
import {
  getReserveDetailBaseRoute,
  RESERVE_QUERY_KEYS,
  ROUTES,
} from "./routes";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const Activity = lazyWithRetry(() => import("./components/pages/Activity"));
const DashboardPage = lazyWithRetry(() =>
  import("./components/simple/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

const importAaveReserveDetail = () =>
  import("./applications/aave/components/Detail");
const AaveReserveDetail = lazyWithRetry(() =>
  importAaveReserveDetail().then((m) => ({ default: m.AaveReserveDetail })),
);

// Guarded as whole subtrees, so a v3 deep link redirects rather than 404s.
// See `config/v3Navigation.ts` for the guard list (derived from the
// sidebar's nav items so it can't silently drift from the six sections).

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader />
  </div>
);

const AaveOverlayLayout = () => {
  const outletContext = useOutletContext<RootLayoutContext>();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const reserveId = searchParams.get(RESERVE_QUERY_KEYS.RESERVE_ID);
  const tab =
    searchParams.get(RESERVE_QUERY_KEYS.TAB) === LOAN_TAB.REPAY
      ? LOAN_TAB.REPAY
      : LOAN_TAB.BORROW;

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
            <Outlet context={outletContext} />
          </Suspense>
          {reserveId &&
            pathname ===
              getReserveDetailBaseRoute(featureFlags.isV3UiEnabled) && (
              <Suspense fallback={null}>
                <AaveReserveDetail reserveId={reserveId} tab={tab} />
              </Suspense>
            )}
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

const V3Placeholder = () =>
  featureFlags.isV3UiEnabled ? (
    <div data-testid="v3-placeholder" />
  ) : (
    <Navigate to={ROUTES.OVERVIEW} replace />
  );

export const Router = () => (
  <Routes>
    <Route element={<RootLayout />}>
      <Route element={<AaveOverlayLayout />}>
        <Route path={ROUTES.OVERVIEW} element={<DashboardPage />} />
        <Route path={ROUTES.LOANS} element={<V3Placeholder />} />
      </Route>
      <Route path={ROUTES.VAULTS} element={<V3Placeholder />} />
      <Route path={ROUTES.LIQUIDATIONS} element={<V3Placeholder />} />
      <Route
        path={ROUTES.ACTIVITY}
        element={
          <Suspense fallback={<RouteFallback />}>
            <ActivityWithProviders />
          </Suspense>
        }
      />
    </Route>
    {!featureFlags.isV3UiEnabled &&
      V3_GUARDED_ROUTE_PATHS.map((path) => (
        <Route
          key={path}
          path={`/${path}/*`}
          element={<Navigate to={ROUTES.OVERVIEW} replace />}
        />
      ))}
    <Route path="*" element={<NotFound />} />
  </Routes>
);
