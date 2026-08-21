/**
 * The single god-mode mount point (dev / QA only).
 *
 * Wires the tab registry into the shell — see `GodModePanel` for the chrome
 * (drag, pop-out, tab rail, active-overrides chip) and `registry.ts` for what
 * each tab shows and which flag (if any) gates it.
 *
 * It is rendered by the route layout that wraps Overview / Vaults / Loans,
 * and by the Activity route (see router.tsx), so every tab gets the same
 * controls and the panel keeps its open/dragged/popped-out state while
 * navigating within a subtree. The mock list itself lives in a module store,
 * so it survives any navigation.
 *
 * It is mounted per subtree rather than in RootLayout because the Position
 * tab's cascade simulator reads the Aave providers (config / reorder /
 * activating vaults) that only those subtrees mount.
 *
 * Everything here is behind `import.meta.env.DEV` at the import site, so this
 * module and its whole dev subtree are dropped from production builds.
 */

import { GodModePanel } from "./GodModePanel";
import { DEV_PANEL_TABS } from "./registry";

export function GodModeMount() {
  return <GodModePanel registry={DEV_PANEL_TABS} />;
}
