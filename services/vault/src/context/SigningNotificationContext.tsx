/**
 * SigningNotificationContext
 *
 * App-level coordinator for browser (desktop) notifications that tell the
 * depositor "you need to sign something" when they are on another tab.
 *
 * A single instance owns the de-dup registry so each observer that feeds it
 * - the active deposit flow ({@link useDepositSigningNotification}) and the
 * pending-deposit poller ({@link useSigningRequiredNotifications}) - never fires
 * the same key twice across poll ticks or tab-visibility changes. The two
 * observers use disjoint key namespaces, so the registry does not dedup the
 * same logical requirement across them; while a deposit runs, the no-double-fire
 * guarantee comes from the `activeFlow` flag, which stands the pending-deposit
 * observer down so only the in-flow observer notifies. The provider also owns
 * the single `documentHidden` source.
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
   * the tab is hidden. De-duplicated per `key` for the session, so a given
   * `key` never notifies twice - no matter which observer reports it or how
   * many poll ticks see it. (The two observers use disjoint key namespaces, so
   * the registry does not collapse the same logical requirement across them.)
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
    enabled ? loadNotificationPromptDismissed() : false,
  );
  const [activeFlow, setActiveFlowState] = useState(false);
  const documentHidden = useDocumentHidden(enabled);

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
      // If the platform couldn't actually show it (API became unusable, or the
      // constructor threw), release the key so a later observer can still nudge
      // once rather than consuming the once-per-session slot with nothing shown.
      if (!showBrowserNotification(copy, key)) {
        shownKeysRef.current.delete(key);
      }
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
      documentHidden,
      isActiveFlow: activeFlow,
      setActiveFlow,
    }),
    [
      requestPermission,
      notifySigningRequired,
      shouldPromptForPermission,
      dismissPrompt,
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
