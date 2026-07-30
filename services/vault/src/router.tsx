import { Loader } from "@babylonlabs-io/core-ui";
import { lazy, Suspense, useEffect } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useOutletContext,
  useSearchParams,
} from "react-router";

import featureFlags from "@/config/featureFlags";
import {
  getFlagDisabledV3SectionPaths,
  isV3SectionEnabled,
  V3_GUARDED_ROUTE_PATHS,
} from "@/config/v3Navigation";

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
import { MARKET_PARAM, RESERVE_QUERY_KEYS, ROUTES } from "./routes";
import { lazyWithRetry } from "./utils/lazyWithRetry";

const Activity = lazyWithRetry(() => import("./components/pages/Activity"));
const VaultsPage = lazyWithRetry(() => import("./components/pages/VaultsPage"));
const LoansPage = lazyWithRetry(() => import("./components/pages/Loans"));
const ExplorePage = lazyWithRetry(() => import("./components/pages/Explore"));
const BorrowingMarketsDataPage = lazyWithRetry(
  () => import("./components/pages/BorrowingMarketsData"),
);
const Liquidations = lazyWithRetry(
  () => import("./components/pages/Liquidations"),
);
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

const importLoanFlowOverlay = () =>
  import("./applications/aave/components/Detail");
const LoanFlowOverlay = lazyWithRetry(() =>
  importLoanFlowOverlay().then((m) => ({ default: m.LoanFlowOverlay })),
);

// Guarded as whole subtrees, so a deep link into a section the flags hide
// redirects rather than 404s — every v3 section while the v3 shell flag is
// off, and the individually flag-gated ones while it is on. See
// `config/v3Navigation.ts` for both lists (derived from the sidebar's nav
// items so they can't silently drift from the six sections).

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
  const [searchParams] = useSearchParams();
  const reserveId = searchParams.get(RESERVE_QUERY_KEYS.RESERVE_ID);
  const tab =
    searchParams.get(RESERVE_QUERY_KEYS.TAB) === LOAN_TAB.REPAY
      ? LOAN_TAB.REPAY
      : LOAN_TAB.BORROW;
  const pickerParam = searchParams.get(RESERVE_QUERY_KEYS.PICKER);
  const picker =
    pickerParam === LOAN_TAB.REPAY
      ? LOAN_TAB.REPAY
      : pickerParam === LOAN_TAB.BORROW
        ? LOAN_TAB.BORROW
        : null;

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(() => {
        void importLoanFlowOverlay();
      });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(() => {
      void importLoanFlowOverlay();
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
          {/* No pathname condition: the flow opens over whichever page under
              this layout the depositor is on (Overview, Vaults, Loans, a
              market page), so the entry points never have to navigate to a
              fixed route and paint it behind the dialog first. This element
              only exists inside the Aave layout, so the params cannot open it
              from an unrelated route. */}
          {(reserveId || picker) && (
            <Suspense fallback={null}>
              <LoanFlowOverlay
                picker={picker}
                reserveId={reserveId}
                tab={tab}
              />
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

export const Router = () => {
  // Read per render, not at module scope: the flags decide which subtrees are
  // guarded, and a flag can differ between renders (see v3Navigation.ts).
  const guardedSubtreePaths = featureFlags.isV3UiEnabled
    ? getFlagDisabledV3SectionPaths()
    : V3_GUARDED_ROUTE_PATHS;

  return (
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
          <Route
            path={`${ROUTES.MARKETS}/:${MARKET_PARAM}`}
            element={
              featureFlags.isV3UiEnabled &&
              featureFlags.isMarketDetailPageEnabled ? (
                <Suspense fallback={<RouteFallback />}>
                  <BorrowingMarketsDataPage />
                </Suspense>
              ) : (
                <Navigate to={ROUTES.OVERVIEW} replace />
              )
            }
          />
          {/* Under AaveOverlayLayout (like /loans): the page reads
              `useDashboardState` / `usePositionNotifications`, both of which
              need the Aave config this layout provides. */}
          <Route
            path={ROUTES.LIQUIDATIONS}
            element={
              featureFlags.isV3UiEnabled &&
              isV3SectionEnabled("liquidations") ? (
                <Suspense fallback={<RouteFallback />}>
                  <Liquidations />
                </Suspense>
              ) : (
                <Navigate to={ROUTES.OVERVIEW} replace />
              )
            }
          />
        </Route>
        {/* Explore is a v3-only static page with no Aave providers or reserve
            overlay, so it sits directly under RootLayout (like /activity), not
            under AaveOverlayLayout. Gated on the v3 shell plus its own flag
            (like /liquidations); the subtree guards below cover /explore/*
            under either flag being off. */}
        <Route
          path={ROUTES.EXPLORE}
          element={
            featureFlags.isV3UiEnabled && isV3SectionEnabled("explore") ? (
              <Suspense fallback={<RouteFallback />}>
                <ExplorePage />
              </Suspense>
            ) : (
              <Navigate to={ROUTES.OVERVIEW} replace />
            )
          }
        />
        <Route
          path={ROUTES.ACTIVITY}
          element={
            <Suspense fallback={<RouteFallback />}>
              <ActivityWithProviders />
            </Suspense>
          }
        />
      </Route>
      {guardedSubtreePaths.map((path) => (
        <Route
          key={path}
          path={`/${path}/*`}
          element={<Navigate to={ROUTES.OVERVIEW} replace />}
        />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
