import type { LoanTab } from "@/applications/aave/constants";

export const ROUTES = {
  OVERVIEW: "/",
  VAULTS: "/vaults",
  LOANS: "/loans",
  ACTIVITY: "/activity",
  LIQUIDATIONS: "/liquidations",
} as const;

export function getReserveDetailRoute(reserveId: string, tab: LoanTab) {
  const params = new URLSearchParams({
    reserve: reserveId.toLowerCase(),
    tab,
  });
  return `${ROUTES.OVERVIEW}?${params.toString()}`;
}
