/**
 * Single source of truth for the v3 sidebar's six nav sections (path + label
 * + group layout). Router guards, the header's page title, and the sidebar
 * itself all derive from this instead of maintaining their own copies, so a
 * renamed/re-pathed section can't silently desync between them.
 *
 * Icons are deliberately not part of this module — it stays a plain data
 * module (no React, no core-ui) so the router and the `usePageTitle` hook
 * don't have to import a component tree just to read a path/label pair.
 * `components/shared/AppSidebar.tsx` maps `id` -> icon component.
 */

import { COPY } from "@/copy";

export type V3NavItemId =
  | "overview"
  | "vaults"
  | "loans"
  | "activity"
  | "liquidations"
  | "explore";

export interface V3NavItem {
  id: V3NavItemId;
  path: string;
  label: string;
}

// Matches Figma's two nav groups (a 40px gap separates them; items within a
// group are flush against each other).
export const V3_NAV_GROUPS: readonly V3NavItem[][] = [
  [
    { id: "overview", path: "/", label: COPY.nav.overview },
    { id: "vaults", path: "/vaults", label: COPY.nav.vaults },
    { id: "loans", path: "/loans", label: COPY.nav.loans },
    { id: "activity", path: "/activity", label: COPY.nav.activity },
  ],
  [
    {
      id: "liquidations",
      path: "/liquidations",
      label: COPY.nav.liquidations,
    },
    { id: "explore", path: "/explore", label: COPY.nav.explore },
  ],
];

export const V3_NAV_ITEMS: readonly V3NavItem[] = V3_NAV_GROUPS.flat();

// v3-only sections with no routed page yet (see router.tsx), guarded as
// whole subtrees so a direct load or stale deep link redirects to the v2
// dashboard instead of falling through to the 404 route. Bare segments
// (no leading slash) to match router.tsx's `${path}/*` route pattern.
// Excludes "/" (root is never guarded) and "/activity" (has a real route).
export const V3_GUARDED_ROUTE_PATHS: readonly string[] = V3_NAV_ITEMS.filter(
  (item) => item.path !== "/" && item.path !== "/activity",
).map((item) => item.path.slice(1));
