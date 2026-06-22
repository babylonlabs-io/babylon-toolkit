/**
 * NotificationPermissionBanner
 *
 * Top-of-app prompt nudging the depositor to allow browser notifications, so
 * we can ping them when a deposit needs a signature. Renders only while the
 * feature is on, the browser supports notifications, and the user hasn't
 * decided yet (see `shouldPromptForPermission`). Dismissible for the session.
 *
 * Temporary placement alongside the testing banner - expected to move later.
 */

import { Text } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";

export function NotificationPermissionBanner() {
  const notifier = useSigningNotificationOptional();
  const [dismissed, setDismissed] = useState(false);

  if (!notifier?.shouldPromptForPermission || dismissed) {
    return null;
  }

  return (
    <div className="relative flex flex-row items-center justify-center gap-3 bg-secondary-main px-10 py-2 text-center text-accent-contrast">
      <Text variant="body2">{COPY.deposit.notifications.banner.message}</Text>
      <button
        type="button"
        onClick={() => notifier.requestPermission()}
        className="rounded-md border border-current px-3 py-1 text-sm font-medium hover:opacity-80"
      >
        {COPY.deposit.notifications.banner.enable}
      </button>
      <button
        type="button"
        aria-label={COPY.deposit.notifications.banner.dismissAria}
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none opacity-70 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
