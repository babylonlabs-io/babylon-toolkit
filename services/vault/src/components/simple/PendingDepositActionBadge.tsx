import { useMemo } from "react";

import { getSectionActionRequiredLabel } from "@/components/deposit/actionStatus";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";

interface PendingDepositActionBadgeProps {
  pendingActivityIds: string[];
  isExpanded: boolean;
}

/**
 * Fixed white-pill styling for the action-required badge. The white background
 * and dark text are intentionally theme-independent (the pill reads the same in
 * light and dark mode), so they cannot map to the theme's semantic color tokens.
 * Centralized here to stop the values drifting if the pill is reused.
 */
const ACTION_BADGE_PILL_CLASS =
  "inline-flex h-10 items-center justify-center rounded-full bg-[#FFFFFF] px-4 text-base font-normal leading-6 tracking-[0.15px] text-[#111111]";

export function PendingDepositActionBadge({
  pendingActivityIds,
  isExpanded,
}: PendingDepositActionBadgeProps) {
  const { getPollingResult } = usePeginPolling();

  const label = useMemo(() => {
    if (isExpanded || pendingActivityIds.length === 0) return null;
    const results = pendingActivityIds.map((id) => getPollingResult(id));
    return getSectionActionRequiredLabel(results);
  }, [getPollingResult, isExpanded, pendingActivityIds]);

  if (label === null) return null;

  return (
    <span
      className={ACTION_BADGE_PILL_CLASS}
      role="status"
      aria-label={`Action required: ${label}`}
      title={`A pending deposit requires action: ${label}`}
    >
      {label}
    </span>
  );
}
