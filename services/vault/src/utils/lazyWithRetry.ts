import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import { classifyError } from "@/utils/errors/formatting";

// A redeploy invalidates old hashed chunk names, so an open tab's dynamic
// import() 404s. Reload once to fetch the fresh index.html + chunks. One shared
// key, since a deploy changes every chunk together.
const RELOAD_FLAG = "staleDeployReload";

// Dedupes same-tick triggers (the loader catch + the vite:preloadError listener).
let reloadInFlight = false;

function reloadAlreadyTried(): boolean {
  try {
    return window.sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    return false;
  }
}

// Returns false if storage is blocked — then we must NOT reload (the guard
// wouldn't survive the reload, so the page would loop).
function markReloadTried(): boolean {
  try {
    window.sessionStorage.setItem(RELOAD_FLAG, "1");
    return true;
  } catch {
    return false;
  }
}

/** Reloads once per tab-session for a stale-deploy chunk 404; false if already
 *  spent or storage is blocked (caller should surface the error). */
export function reloadForStaleDeploy(): boolean {
  if (reloadInFlight) return true;
  if (reloadAlreadyTried()) return false;
  if (!markReloadTried()) return false;
  reloadInFlight = true;
  window.location.reload();
  return true;
}

const isStaleDeployError = (error: unknown): boolean =>
  classifyError(error) === "stale-deploy";

/** `React.lazy` that reloads once on a stale-deploy chunk 404 instead of
 *  crashing. Recovery lives in the loader: React caches a rejected lazy
 *  promise, so resetting the error boundary can't retry it. */
// Mirrors React.lazy's own `ComponentType<any>` constraint so a route
// component with required props (e.g. the reserve detail's `tab`) can be
// wrapped too — `ComponentType<{}>` would reject it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      // No clear-on-success: re-arming would let a persistently-missing chunk
      // reload-loop while sibling chunks load fine.
      return await factory();
    } catch (error) {
      if (isStaleDeployError(error) && reloadForStaleDeploy()) {
        // Reloading — stay suspended instead of flashing the error.
        return new Promise<{ default: T }>(() => undefined);
      }
      throw error;
    }
  });
}
