import { useLocation } from "react-router";

import { V3_NAV_ITEMS } from "@/config/v3Navigation";
import { COPY } from "@/copy";
import { ROUTES } from "@/routes";

// Routed v3 pages the sidebar does not list, so they have no nav item to
// derive a title from.
const OFF_NAV_ROUTE_TITLES: readonly (readonly [
  path: string,
  title: string,
])[] = [[ROUTES.MARKETS, COPY.marketData.pageTitle]];

// First segment-boundary match against the v3 sidebar's routes (see
// `config/v3Navigation.ts`'s `V3_NAV_ITEMS`, also used by
// `components/shared/AppSidebar.tsx`), so a path the sidebar treats as
// "Vaults" (etc.) shows that same title in the header. Anything that
// doesn't match is the Overview page, so it's the fallback rather than a
// listed prefix. Harmless because none of the configured prefixes is
// itself a prefix of another. Every v3 path is listed, flag-gated sections
// included: a gated path redirects (see router.tsx) before its title is
// user-visible, so filtering by flag here would change nothing observable.
const ROUTE_TITLES: readonly (readonly [path: string, title: string])[] = [
  ...V3_NAV_ITEMS.filter((item) => item.path !== "/").map(
    (item) => [item.path, item.label] as const,
  ),
  ...OFF_NAV_ROUTE_TITLES,
];

/** Current page title for the v3 header, driven by the active route. */
export function usePageTitle(): string {
  const { pathname } = useLocation();
  // Segment-boundary match — mirrors react-router's `NavLink` (used by
  // AppSidebar's nav links), so `/vaults` matches but `/vaultsfoo` doesn't.
  // Case-insensitive, matching react-router's own default route/NavLink
  // matching, so `/Activity` resolves the same as `/activity`.
  const lowerPathname = pathname.toLowerCase();
  const match = ROUTE_TITLES.find(
    ([path]) => lowerPathname === path || lowerPathname.startsWith(`${path}/`),
  );
  return match ? match[1] : COPY.nav.overview;
}
