/**
 * NotificationPermissionPrompt
 *
 * In-flow callout nudging the depositor to allow browser notifications so we
 * can ping them when a deposit needs a signature. Styled as an `info` Callout
 * to match the deposit progress view's other callouts.
 *
 * Shown only while `shouldPromptForPermission` is true: the feature is enabled,
 * the browser supports notifications, the user hasn't decided yet, and they
 * haven't dismissed the prompt.
 */

import { Button, Callout } from "@babylonlabs-io/core-ui";

import { useSigningNotificationOptional } from "@/context/SigningNotificationContext";
import { COPY } from "@/copy";

export function NotificationPermissionPrompt() {
  const notifier = useSigningNotificationOptional();

  if (!notifier?.shouldPromptForPermission) {
    return null;
  }

  return (
    <Callout variant="info" title={COPY.deposit.notifications.prompt.title}>
      <div className="flex flex-col items-start gap-3">
        <span>{COPY.deposit.notifications.prompt.message}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            onClick={() => notifier?.requestPermission()}
          >
            {COPY.deposit.notifications.prompt.enable}
          </Button>
          <Button
            variant="ghost"
            color="secondary"
            size="small"
            onClick={() => notifier?.dismissPrompt()}
          >
            {COPY.deposit.notifications.prompt.dismiss}
          </Button>
        </div>
      </div>
    </Callout>
  );
}
