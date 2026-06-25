/**
 * NotificationPermissionPrompt
 *
 * In-flow card nudging the depositor to allow browser notifications so we can
 * ping them when a deposit needs a signature. A bell icon in an info-toned tile
 * sits beside the heading, body copy, and the Enable / No thanks actions.
 *
 * Shown only while `shouldPromptForPermission` is true: the feature is enabled,
 * the browser supports notifications, the user hasn't decided yet, and they
 * haven't dismissed the prompt.
 */

import { Text } from "@babylonlabs-io/core-ui";
import { IoNotifications } from "react-icons/io5";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";

const NOTIFICATION_ICON_SIZE = 20;

export function NotificationPermissionPrompt() {
  const notifier = useSigningNotificationOptional();

  if (!notifier?.shouldPromptForPermission) {
    return null;
  }

  return (
    <div className="flex w-full items-start gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-info-dark">
        <IoNotifications
          size={NOTIFICATION_ICON_SIZE}
          className="text-accent-contrast"
        />
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col">
          <Text variant="body1" className="text-accent-primary">
            {COPY.deposit.notifications.prompt.title}
          </Text>
          <Text variant="body2" className="text-accent-secondary">
            {COPY.deposit.notifications.prompt.message}
          </Text>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => notifier.requestPermission()}
            className="flex h-9 items-center justify-center rounded-lg bg-info-dark px-4 text-sm text-accent-contrast transition-opacity hover:opacity-90"
          >
            {COPY.deposit.notifications.prompt.enable}
          </button>
          <button
            type="button"
            onClick={() => notifier.dismissPrompt()}
            className="flex h-9 items-center justify-center rounded-lg border border-secondary-strokeLight px-4 text-sm text-accent-primary transition-opacity hover:opacity-80"
          >
            {COPY.deposit.notifications.prompt.dismiss}
          </button>
        </div>
      </div>
    </div>
  );
}
