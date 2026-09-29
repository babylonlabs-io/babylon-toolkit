/**
 * Persists whether the depositor has seen the Liquidation Analysis tour.
 *
 * A single boolean flag, not network-namespaced (the tour is a
 * browser/profile concern, not a chain concern). Seeing it is one-way: every
 * way out of the welcome or the tour sets it.
 */

const STORAGE_KEY = "tbv-liquidation-tour-seen";

export function loadLiquidationTourSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markLiquidationTourSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* quota / disabled - non-fatal, the current visit still ends the tour */
  }
}
