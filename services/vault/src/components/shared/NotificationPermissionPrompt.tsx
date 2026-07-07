/**
 * NotificationPermissionPrompt
 *
 * In-flow card nudging the depositor to allow browser notifications so we can
 * ping them when a deposit needs a signature. A thin container around the
 * shared core-ui {@link Callout}: it owns only the gating, the bell icon, the
 * copy, and the Enable / No thanks wiring - all layout and styling come from
 * the design-system component.
 *
 * Shown only while `shouldPromptForPermission` is true: the feature is enabled,
 * the browser supports notifications, the user hasn't decided yet, and they
 * haven't dismissed the prompt.
 */

import { Callout, type CalloutAction } from "@babylonlabs-io/core-ui";
import { IoNotifications } from "react-icons/io5";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";

const NOTIFICATION_ICON_SIZE = 20;

export function NotificationPermissionPrompt() {
  const notifier = useSigningNotificationOptional();

  if (!notifier?.shouldPromptForPermission) {
    return null;
  }

  const actions: CalloutAction[] = [
    {
      label: COPY.deposit.notifications.prompt.enable,
      emphasis: "primary",
      onClick: () => notifier.requestPermission(),
    },
    {
      label: COPY.deposit.notifications.prompt.dismiss,
      emphasis: "secondary",
      onClick: () => notifier.dismissPrompt(),
    },
  ];

  return (
    <Callout
      variant="infoStrong"
      icon={
        <IoNotifications
          size={NOTIFICATION_ICON_SIZE}
          className="text-accent-contrast"
        />
      }
      title={COPY.deposit.notifications.prompt.title}
      actions={actions}
    >
      {COPY.deposit.notifications.prompt.message}
    </Callout>
  );
}
