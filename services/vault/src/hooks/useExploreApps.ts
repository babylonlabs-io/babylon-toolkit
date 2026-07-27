import { useMemo } from "react";

import { type ExploreApp, getExploreApps } from "@/config/exploreApps";

export interface UseExploreAppsResult {
  apps: ExploreApp[];
  isLoading: boolean;
}

/**
 * Explore page data source. Backed by the static registry today; the return
 * shape is deliberately the same one a fetched implementation would expose
 * (a list plus a loading flag), so swapping in `useQuery` later is a
 * hook-internal change that leaves callers untouched.
 */
export function useExploreApps(): UseExploreAppsResult {
  const apps = useMemo(() => getExploreApps(), []);
  return { apps, isLoading: false };
}
