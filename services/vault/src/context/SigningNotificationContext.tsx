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
 * ever firing the same notification twice. It also owns the single
 * `documentHidden` source and the `activeFlow` flag that hands ownership of
 * notifications to the in-flow observer while a deposit is running.
 *
 * Gated by the `ENABLE_SIGNING_NOTIFICATIONS` feature flag: when off, every
 * method is a no-op and no OS permission is requested.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FeatureFlags } from "@/config";
import { useDocumentHidden } from "@/hooks/useDocumentHidden";
import {
  loadNotificationPromptDismissed,
  setNotificationPromptDismissed,
} from "@/storage/notificationPromptStorage";
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
  /**
   * Whether to surface the "enable notifications" prompt: the feature is on,
   * the browser supports notifications, the user hasn't decided yet (neither
   * granted nor blocked), and they haven't dismissed the prompt.
   */
  shouldPromptForPermission: boolean;
  /** Dismiss the prompt and remember it across reloads. */
  dismissPrompt: () => void;
  /**
   * Clear a prior dismissal so the prompt can be offered again — the "revert"
   * hook for a future re-enable entry point (e.g. a settings toggle). Kept
   * deliberately ahead of its UI; not yet wired to a production caller.
   */
  resetPromptDismissal: () => void;
  /** Single reactive `document.visibilityState === "hidden"` source. */
  documentHidden: boolean;
  /**
   * Whether an active deposit flow is driving signing in-modal. While true the
   * pending-deposit observer stands down so it can't double-notify alongside
   * the in-flow observer for the same deposit.
   */
  isActiveFlow: boolean;
  /** Mark the active deposit flow as running / stopped. */
  setActiveFlow: (active: boolean) => void;
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
  const [permission, setPermission] = useState<NotificationPermission | null>(
    () => (enabled ? getBrowserNotificationPermission() : null),
  );
  const [promptDismissed, setPromptDismissed] = useState<boolean>(() =>
    loadNotificationPromptDismissed(),
  );
  const [activeFlow, setActiveFlowState] = useState(false);
  const documentHidden = useDocumentHidden();

  const requestPermission = useCallback(() => {
    if (!enabled) return;
    void requestBrowserNotificationPermission()
      .then((result) => {
        if (result) setPermission(result);
      })
      .catch(() => {
        // A rejected/denied request just means we never show a notification.
      });
  }, [enabled]);

  const dismissPrompt = useCallback(() => {
    setNotificationPromptDismissed(true);
    setPromptDismissed(true);
  }, []);

  const resetPromptDismissal = useCallback(() => {
    setNotificationPromptDismissed(false);
    setPromptDismissed(false);
  }, []);

  const setActiveFlow = useCallback(
    (active: boolean) => setActiveFlowState(active),
    [],
  );

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

  // When the tab regains focus (documentHidden → false), re-read permission so
  // an out-of-band decision (Brave's address-bar prompt, browser settings)
  // clears the enable-prompt without a reload.
  useEffect(() => {
    if (!enabled || documentHidden) return;
    setPermission(getBrowserNotificationPermission());
  }, [enabled, documentHidden]);

  const shouldPromptForPermission =
    enabled && permission === "default" && !promptDismissed;

  const value = useMemo(
    () => ({
      requestPermission,
      notifySigningRequired,
      shouldPromptForPermission,
      dismissPrompt,
      resetPromptDismissal,
      documentHidden,
      isActiveFlow: activeFlow,
      setActiveFlow,
    }),
    [
      requestPermission,
      notifySigningRequired,
      shouldPromptForPermission,
      dismissPrompt,
      resetPromptDismissal,
      documentHidden,
      activeFlow,
      setActiveFlow,
    ],
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
