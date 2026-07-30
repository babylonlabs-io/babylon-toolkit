/**
 * Single source of truth for the v3 sidebar's six nav sections (path + label
 * + group layout) and for which of them their own feature flag currently
 * enables. Router guards, the header's page title, and the sidebar itself all
 * derive from this instead of maintaining their own copies, so a renamed,
 * re-pathed or newly flag-gated section can't silently desync between them.
 *
 * Icons are deliberately not part of this module — it stays a plain data
 * module (no React, no core-ui) so the router and the `usePageTitle` hook
 * don't have to import a component tree just to read a path/label pair.
 * `components/shared/AppSidebar.tsx` maps `id` -> icon component.
 *
 * Feature flags are only ever read inside the functions below, never into a
 * module-scope constant: the router reads its guards on every render, and the
 * tests flip a mutable flag mock between cases in one module instance.
 */

import featureFlags from "@/config/featureFlags";
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
const V3_NAV_GROUPS: readonly V3NavItem[][] = [
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

/**
 * Sections that carry their own feature flag on top of the v3 shell flag, so
 * they can stay hidden while v3 is already on in devnet/testnet. Sections
 * absent from this map ship with the v3 shell.
 *
 * The values are thunks, not booleans: they defer each flag read past this
 * module's evaluation, so flipping a flag (in a test, or between renders)
 * takes effect. Inlining them as values would freeze every flag at import.
 */
const V3_SECTION_FLAG_GATES: Partial<Record<V3NavItemId, () => boolean>> = {
  liquidations: () => featureFlags.isLiquidationAnalysisChartEnabled,
  explore: () => featureFlags.isExploreEnabled,
};

/** Whether a section's own flag currently enables it (see the gate map). */
export function isV3SectionEnabled(id: V3NavItemId): boolean {
  return V3_SECTION_FLAG_GATES[id]?.() ?? true;
}

/**
 * The nav groups the sidebar should render: flag-disabled sections removed,
 * and any group they emptied dropped so no stray group gap remains. Returns
 * the source groups unchanged when every section is enabled, so the common
 * case allocates nothing.
 */
export function getVisibleV3NavGroups(): readonly V3NavItem[][] {
  if (V3_NAV_ITEMS.every((item) => isV3SectionEnabled(item.id))) {
    return V3_NAV_GROUPS;
  }
  return V3_NAV_GROUPS.map((group) =>
    group.filter((item) => isV3SectionEnabled(item.id)),
  ).filter((group) => group.length > 0);
}

// Sections that are never guarded as a subtree: the root (always routed) and
// /activity (a real page in both shells).
const UNGUARDED_V3_PATHS: readonly string[] = ["/", "/activity"];

// Bare segment (no leading slash) to match router.tsx's `${path}/*` pattern.
const toBareSegment = (item: V3NavItem): string => item.path.slice(1);

const guardableV3NavItems = (): readonly V3NavItem[] =>
  V3_NAV_ITEMS.filter((item) => !UNGUARDED_V3_PATHS.includes(item.path));

// Every v3 section, guarded as a whole subtree while the v3 shell flag is off
// so a direct load or stale deep link redirects to the v2 dashboard instead of
// falling through to the 404 route.
export const V3_GUARDED_ROUTE_PATHS: readonly string[] =
  guardableV3NavItems().map(toBareSegment);

/**
 * The subset of sections whose own flag currently disables them — what the
 * router guards while the v3 shell is on, so a deep link into a hidden
 * section redirects like the section root does.
 */
export function getFlagDisabledV3SectionPaths(): readonly string[] {
  return guardableV3NavItems()
    .filter((item) => !isV3SectionEnabled(item.id))
    .map(toBareSegment);
}
