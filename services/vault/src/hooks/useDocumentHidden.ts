/**
 * Reactive `document.visibilityState === "hidden"`, updated on visibilitychange.
 *
 * Used by the notification observers as an effect dependency so they re-evaluate
 * when the user switches tabs: a signing requirement that arose while the tab
 * was focused (and was therefore suppressed) gets a notification the moment the
 * user looks away.
 */

import { useEffect, useState } from "react";

import { isDocumentHidden } from "@/utils/notifications/browserNotification";

export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => isDocumentHidden());

  useEffect(() => {
    const onChange = () => setHidden(isDocumentHidden());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return hidden;
}
