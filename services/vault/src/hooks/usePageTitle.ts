import { useLocation } from "react-router";

import { COPY } from "@/copy";

// Longest-prefix match against the v3 sidebar's routes (see
// components/shared/AppSidebar.tsx's `V3_NAV_GROUPS`), so a path the sidebar
// treats as "Vaults" (etc.) shows that same title in the header. Anything
// that doesn't match — the root dashboard and its AAVE reserve-detail
// overlay routes (`/app/aave/reserve/:id/...`) — is the Overview page, so
// it's the fallback rather than a listed prefix.
const ROUTE_TITLES: readonly (readonly [path: string, title: string])[] = [
  ["/activity", COPY.nav.activity],
  ["/vaults", COPY.nav.vaults],
  ["/loans", COPY.nav.loans],
  ["/liquidations", COPY.nav.liquidations],
  ["/explore", COPY.nav.explore],
];

/** Current page title for the v3 header, driven by the active route. */
export function usePageTitle(): string {
  const { pathname } = useLocation();
  // Segment-boundary match — mirrors react-router's `NavLink` (used by
  // AppSidebar's nav links), so `/vaults` matches but `/vaultsfoo` doesn't.
  const match = ROUTE_TITLES.find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`),
  );
  return match ? match[1] : COPY.nav.overview;
}
