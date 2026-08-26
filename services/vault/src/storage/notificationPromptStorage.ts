/**
 * Persists whether the depositor dismissed the "enable notifications" prompt.
 *
 * A single boolean flag, not network-namespaced (notification preference is a
 * browser/profile concern, not a chain concern). Dismissal is one-way.
 */

const STORAGE_KEY = "tbv-signing-notifications-dismissed";

export function loadNotificationPromptDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function dismissNotificationPrompt(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* quota / disabled — non-fatal */
  }
}
