import type { LoanTab } from "@/applications/aave/constants";

export const ROUTES = {
  OVERVIEW: "/",
  VAULTS: "/vaults",
  LOANS: "/loans",
  ACTIVITY: "/activity",
  LIQUIDATIONS: "/liquidations",
} as const;

export const RESERVE_QUERY_KEYS = {
  RESERVE_ID: "reserve",
  TAB: "tab",
} as const;

export function getReserveDetailBaseRoute(isV3Enabled: boolean): string {
  return isV3Enabled ? ROUTES.LOANS : ROUTES.OVERVIEW;
}

export function getReserveDetailRoute(
  reserveId: string,
  tab: LoanTab,
  isV3Enabled: boolean,
) {
  const baseRoute = getReserveDetailBaseRoute(isV3Enabled);
  const params = new URLSearchParams({
    [RESERVE_QUERY_KEYS.RESERVE_ID]: reserveId.toLowerCase(),
    [RESERVE_QUERY_KEYS.TAB]: tab,
  });
  return `${baseRoute}?${params.toString()}`;
}
