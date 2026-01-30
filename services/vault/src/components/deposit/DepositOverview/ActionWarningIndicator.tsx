/**
 * Action Warning Indicator Component
 *
 * Shows a single warning icon with tooltip messages passed from parent.
 */

import { Hint } from "@babylonlabs-io/core-ui";

/**
 * Warning indicator that displays one or more messages in a tooltip.
 */
export function ActionWarningIndicator({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;

  const tooltip = messages.join(" ");

  return (
    <Hint tooltip={tooltip} attachToChildren>
      <span
        className="text-base text-warning-main"
        role="img"
        aria-label={tooltip}
      >
        ⚠
      </span>
    </Hint>
  );
}
