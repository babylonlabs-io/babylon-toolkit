/**
 * Side-effect-isolated wrappers around the Web Notifications API.
 *
 * Kept free of React so the permission/visibility logic can be unit-tested and
 * the SSR guards live in one place. All callers go through these helpers
 * instead of touching `window.Notification` directly.
 */

/** Copy for a single browser notification. */
export interface BrowserNotificationCopy {
  title: string;
  body: string;
}

/** Branded raster asset shown alongside the notification. */
const NOTIFICATION_ICON_PATH = "/images/mascot-head-happy.png";

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | null {
  if (!isBrowserNotificationSupported()) return null;
  return window.Notification.permission;
}

/** Whether the document is hidden (user is on another tab or window). */
export function isDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * Request OS permission to show notifications. Resolves to the current
 * permission without prompting when unsupported or already decided, so it is
 * safe to call on every deposit gesture.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | null> {
  if (!isBrowserNotificationSupported()) return null;
  if (window.Notification.permission !== "default") {
    return window.Notification.permission;
  }
  return window.Notification.requestPermission();
}

/**
 * Show a notification, returning `true` if one was shown. Refuses only when the
 * API is unusable (unsupported or permission not granted); permission and
 * visibility policy is the caller's decision. Clicking it focuses the
 * originating tab. `tag` collapses repeats for the same logical event so a
 * reload replaces rather than stacks.
 */
export function showBrowserNotification(
  copy: BrowserNotificationCopy,
  tag: string,
): boolean {
  if (!isBrowserNotificationSupported()) return false;
  if (window.Notification.permission !== "granted") return false;
  const notification = new window.Notification(copy.title, {
    body: copy.body,
    icon: NOTIFICATION_ICON_PATH,
    tag,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  return true;
}
