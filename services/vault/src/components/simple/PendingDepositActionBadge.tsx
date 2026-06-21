import { useMemo } from "react";

import { getSectionActionRequiredLabel } from "@/components/deposit/actionStatus";
import { usePeginPolling } from "@/context/deposit/PeginPollingContext";

interface PendingDepositActionBadgeProps {
  pendingActivityIds: string[];
  isExpanded: boolean;
}

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
      className="inline-flex h-10 items-center justify-center rounded-full bg-[#FFFFFF] px-4 text-base font-normal leading-6 tracking-[0.15px] text-[#111111]"
      role="status"
      aria-label={`Action required: ${label}`}
      title={`A pending deposit requires action: ${label}`}
    >
      {label}
    </span>
  );
}
