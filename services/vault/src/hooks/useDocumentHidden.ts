/**
 * Reactive `document.visibilityState === "hidden"`, updated on visibilitychange.
 *
 * Called only by `SigningNotificationProvider`, which puts the value on context
 * and also reads it itself to re-read notification permission when the tab
 * regains focus. The pending-deposit observer consumes it from context as an
 * effect dependency, so it re-evaluates when the user switches tabs: a signing
 * requirement that arose while the tab was focused (and was therefore
 * suppressed) gets a notification the moment the user looks away. The in-flow
 * observer deliberately ignores it - its step outlives the wallet popup, so a
 * second look would ask for a signature the depositor already gave.
 *
 * Pass `enabled: false` to make it a true no-op (no listener attached, always
 * returns `false`) when the consuming feature is flagged off.
 */

import { useEffect, useState } from "react";

import { isDocumentHidden } from "@/utils/notifications/browserNotification";

export function useDocumentHidden(enabled: boolean = true): boolean {
  const [hidden, setHidden] = useState(() =>
    enabled ? isDocumentHidden() : false,
  );

  useEffect(() => {
    if (!enabled) return;
    const onChange = () => setHidden(isDocumentHidden());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [enabled]);

  return hidden;
}
