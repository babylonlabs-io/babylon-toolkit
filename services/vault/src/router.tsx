import { Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense, useEffect } from "react";
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
const VaultsPage = lazyWithRetry(() => import("./components/pages/VaultsPage"));
const LoansPage = lazyWithRetry(() => import("./components/pages/Loans"));
const DashboardPage = lazyWithRetry(() =>
  import("./components/simple/DashboardPage").then((m) => ({
    default: m.DashboardPage,
  })),
);

// Dev-only god-mode panel, lazily imported behind `import.meta.env.DEV` so the
// whole dev subtree is dropped from production builds (the dynamic import sits
// in a dead branch the bundler eliminates).
const GodModeMount = import.meta.env.DEV
  ? lazy(() =>
      import("./dev/GodModeMount").then((m) => ({ default: m.GodModeMount })),
    )
  : null;

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

/** The dev/QA god-mode panel, or nothing outside a flagged dev build. Rendered
 *  once per route subtree that mounts the Aave providers its debug sections
 *  read (see the two call sites below). */
const GodModePanelSlot = () =>
  GodModeMount && featureFlags.isGodModePanelEnabled ? (
    <Suspense fallback={null}>
      <GodModeMount />
    </Suspense>
  ) : null;

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
          {/* One god-mode panel for every tab under this layout (Overview,
              Vaults, Loans) — mounted here, not per page, so it is present on
              all three and keeps its open/position state across navigation.
              This layout supplies the Aave providers its position-notifications
              section reads. */}
          <GodModePanelSlot />
        </ReorderOverrideProvider>
      </PendingVaultsProvider>
    </AaveConfigProvider>
  );
};

const ActivityWithProviders = () => (
  <AaveConfigProvider>
    {/* Activity itself needs no reorder override — this is the one provider
        the god-mode position-notifications section reads (through
        `useDashboardState`) that this route does not otherwise mount, and it
        is in-memory-only state, so a second instance here is inert for the
        page. Without it the panel would throw on /activity.

        The panel's full context dependency set is AaveConfig (mounted here),
        ReorderOverride (mounted here) and ActivatingVaults (RootLayout).
        Notably NOT PendingVaults: that context is reached only through
        `useAaveVaults` and `useWithdrawCollateralTransaction`, neither of
        which this subtree mounts — so the Aave layout's PendingVaultsProvider
        is deliberately not duplicated here.

        The feed itself is demo-aware: `useActivitiesWithPending` merges the
        panel's activity mocks into the rows it returns (see dev/demoDeposit),
        so mock rows DO render on this page — while disconnected too —
        alongside the theme and protocol-status / max-vaults overrides. */}
    <ReorderOverrideProvider>
      <Activity />
      <GodModePanelSlot />
    </ReorderOverrideProvider>
  </AaveConfigProvider>
);

// /liquidations: v3 shell + the liquidation-analysis flag, so the section is
// unreachable by deep link while its sidebar entry is hidden.
const V3Placeholder = () =>
  featureFlags.isV3UiEnabled &&
  featureFlags.isLiquidationAnalysisChartEnabled ? (
    <div data-testid="v3-placeholder" />
  ) : (
    <Navigate to={ROUTES.OVERVIEW} replace />
  );

export const Router = () => (
  <Routes>
    <Route element={<RootLayout />}>
      <Route element={<AaveOverlayLayout />}>
        <Route path={ROUTES.OVERVIEW} element={<DashboardPage />} />
        {/* Registered only when the v3 flag is on: with no exact /vaults
            route, the flag-off subtree guard below catches the bare path
            (a splat matches zero segments) and redirects before any
            provider mounts. Nesting a flag-off redirect here instead would
            make it wait on AaveConfigProvider's blocking config fetch. */}
        {featureFlags.isV3UiEnabled && (
          <Route path={ROUTES.VAULTS} element={<VaultsPage />} />
        )}
        <Route
          path={ROUTES.LOANS}
          element={
            featureFlags.isV3UiEnabled ? (
              <Suspense fallback={<RouteFallback />}>
                <LoansPage />
              </Suspense>
            ) : (
              <Navigate to={ROUTES.OVERVIEW} replace />
            )
          }
        />
      </Route>
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
