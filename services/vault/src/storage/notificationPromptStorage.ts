/**
 * Persists whether the depositor dismissed the "enable notifications" prompt.
 *
 * A single boolean flag, not network-namespaced (notification preference is a
 * browser/profile concern, not a chain concern). Cleared via
 * {@link setNotificationPromptDismissed}`(false)` so the prompt can be
 * re-offered later (the "revert" path).
 */

const STORAGE_KEY = "tbv-signing-notifications-dismissed";

export function loadNotificationPromptDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setNotificationPromptDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* quota / disabled — non-fatal */
  }
}
