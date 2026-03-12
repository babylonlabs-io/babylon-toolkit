import { Chip } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoWarningOutline } from "react-icons/io5";

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
    <Chip
      className="inline-flex items-center gap-1.5 text-accent-primary"
      role="status"
      aria-label={`Action required: ${label}`}
      title={`A pending deposit requires action: ${label}`}
    >
      <IoWarningOutline
        className="h-4 w-4 flex-shrink-0 text-warning-main"
        aria-hidden
      />
      {label}
    </Chip>
  );
}
