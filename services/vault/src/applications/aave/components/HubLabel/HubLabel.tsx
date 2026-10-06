import { Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import { COPY } from "@/copy";
import type { HubIdentity } from "@/services/aave/hubRegistry";

interface HubLabelProps {
  hub: HubIdentity;
  /** Text to show in place of the bare label, e.g. "USDC on Core Hub". */
  children?: ReactNode;
  className?: string;
  /** Set inside a button: the touch hint then shows as text, as a button cannot hold the hint's button. */
  insideButton?: boolean;
}

/**
 * Names a reserve's hub. A hub this build doesn't recognise renders by its
 * short address with a warning hint, so it can't pass for a known hub.
 * Display only: it gates nothing, and debt on an unknown hub stays repayable.
 */
export function HubLabel({
  hub,
  children,
  className,
  insideButton = false,
}: HubLabelProps) {
  const text = children ?? hub.label;
  if (hub.source === "registry") {
    return <span className={className}>{text}</span>;
  }
  if (insideButton) {
    return (
      <Hint
        tooltip={COPY.loans.hub.unknownHubWarning}
        attachToChildren
        touchFallback="text"
        className="w-full"
      >
        <span className={twJoin("inline-flex items-center gap-1", className)}>
          {text}
          <InfoIcon size={16} className="text-warning-main" />
        </span>
      </Hint>
    );
  }
  return (
    <span className={twJoin("inline-flex items-center gap-1", className)}>
      {text}
      <Hint
        tooltip={COPY.loans.hub.unknownHubWarning}
        title={text}
        status="warning"
      />
    </span>
  );
}
