/**
 * SigningNotificationContext
 *
 * App-level coordinator for browser (desktop) notifications that tell the
 * depositor "you need to sign something" when they are on another tab.
 *
 * A single instance owns the de-dup registry so the two observers that feed it
 * - the active deposit flow ({@link useDepositSigningNotification}) and the
 * pending-deposit poller ({@link useSigningRequiredNotifications}) - can both
 * be mounted at once (the deposit modal renders over the dashboard) without
 * ever firing the same notification twice.
 *
 * Gated by the `ENABLE_SIGNING_NOTIFICATIONS` feature flag: when off, every
 * method is a no-op and no OS permission is requested.
 */

import { createContext, useCallback, useContext, useMemo, useRef } from "react";

import { FeatureFlags } from "@/config";
import {
  type BrowserNotificationCopy,
  getBrowserNotificationPermission,
  isDocumentHidden,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from "@/utils/notifications/browserNotification";

interface SigningNotificationContextValue {
  /** Request OS notification permission. Call from a user gesture. */
  requestPermission: () => void;
  /**
   * Fire a "signing required" notification the first time `key` is seen while
   * the tab is hidden. De-duplicated per `key` for the session, so the same
   * signing requirement never notifies twice across observers or poll ticks.
   */
  notifySigningRequired: (key: string, copy: BrowserNotificationCopy) => void;
}

const SigningNotificationContext =
  createContext<SigningNotificationContextValue | null>(null);

export function SigningNotificationProvider({
  children,
}: React.PropsWithChildren) {
  const enabled = FeatureFlags.isSigningNotificationsEnabled;
  // Keys we've already shown. Lives for the session so one signing requirement
  // notifies at most once, no matter how many observers report it.
  const shownKeysRef = useRef<Set<string>>(new Set());

  const requestPermission = useCallback(() => {
    if (!enabled) return;
    void requestBrowserNotificationPermission().catch(() => {
      // A rejected/denied request just means we never show a notification.
    });
  }, [enabled]);

  const notifySigningRequired = useCallback(
    (key: string, copy: BrowserNotificationCopy) => {
      if (!enabled) return;
      if (shownKeysRef.current.has(key)) return;
      // Only the usable + hidden case marks the key handled. A requirement that
      // arises while focused or before permission is granted is left unmarked
      // so a later observer can still notify once the user looks away.
      if (getBrowserNotificationPermission() !== "granted") return;
      if (!isDocumentHidden()) return;
      // Mark synchronously before showing so two observers firing in the same
      // tick can't both surface the same notification.
      shownKeysRef.current.add(key);
      showBrowserNotification(copy, key);
    },
    [enabled],
  );

  const value = useMemo(
    () => ({ requestPermission, notifySigningRequired }),
    [requestPermission, notifySigningRequired],
  );

  return (
    <SigningNotificationContext.Provider value={value}>
      {children}
    </SigningNotificationContext.Provider>
  );
}

/**
 * Returns the signing-notification context, or `null` when no provider is
 * mounted (e.g. in tests). Observers no-op on `null`.
 */
export function useSigningNotificationOptional(): SigningNotificationContextValue | null {
  return useContext(SigningNotificationContext);
}
