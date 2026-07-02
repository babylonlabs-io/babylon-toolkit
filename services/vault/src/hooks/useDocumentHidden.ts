/**
 * Reactive `document.visibilityState === "hidden"`, updated on visibilitychange.
 *
 * Used by the notification observers as an effect dependency so they re-evaluate
 * when the user switches tabs: a signing requirement that arose while the tab
 * was focused (and was therefore suppressed) gets a notification the moment the
 * user looks away.
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
