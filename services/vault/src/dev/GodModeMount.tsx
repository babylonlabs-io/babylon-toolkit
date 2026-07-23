/**
 * The single god-mode mount point (dev / QA only).
 *
 * The panel used to be mounted per page (Overview, then Vaults), which meant
 * the v3 tabs that came later — Loans above all — had no panel at all, and the
 * debug sections below only ever existed on Overview. It is now rendered by the
 * route layout that wraps Overview / Vaults / Loans, and by the Activity route
 * (see router.tsx), so every tab gets the same controls and the panel keeps its
 * open/dragged/popped-out state while navigating within a subtree. The mock
 * list itself lives in a module store, so it survives any navigation.
 *
 * It is mounted per subtree rather than in RootLayout because the
 * position-notifications section reads the Aave providers (config / reorder /
 * activating vaults) that only those subtrees mount.
 *
 * Everything here is behind `import.meta.env.DEV` at the import site, so this
 * module and its whole dev subtree are dropped from production builds.
 */

import featureFlags from "@/config/featureFlags";

import { GodModePanel } from "./GodModePanel";
import { LiquidationAnalysisDebugPanel } from "./LiquidationAnalysisDebugPanel";
import { PositionNotificationsDebugPanel } from "./PositionNotificationsDebugPanel";

export function GodModeMount() {
  return (
    <GodModePanel>
      {featureFlags.isV3UiEnabled && <LiquidationAnalysisDebugPanel />}
      {featureFlags.isLiquidationNotificationsEnabled &&
        featureFlags.isPositionDebugPanelEnabled && (
          <PositionNotificationsDebugPanel />
        )}
    </GodModePanel>
  );
}
