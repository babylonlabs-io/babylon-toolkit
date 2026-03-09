import { VaultDetailRows } from "@/components/shared";
import type { PeginState } from "@/models/peginStateMachine";
import { formatDateTime } from "@/utils/formatting";

type DisplayVariant = PeginState["displayVariant"];

const VARIANT_COLORS: Record<DisplayVariant, string> = {
  pending: "text-warning-main",
  active: "text-success-main",
  inactive: "text-accent-secondary",
  warning: "text-error-main",
};

interface PendingDepositExpandedContentProps {
  statusLabel: string;
  statusVariant: DisplayVariant;
  /** Milliseconds since epoch */
  timestamp?: number;
  txHash: string;
}

export function PendingDepositExpandedContent({
  statusLabel,
  statusVariant,
  timestamp,
  txHash,
}: PendingDepositExpandedContentProps) {
  const formattedDate = timestamp ? formatDateTime(new Date(timestamp)) : "-";

  const statusColor = VARIANT_COLORS[statusVariant];

  return (
    <div className="mt-4 space-y-3 border-t border-secondary-strokeLight pt-4">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-accent-secondary">Status</span>
        <span className={`text-sm font-medium ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <VaultDetailRows date={formattedDate} txHash={txHash} />
    </div>
  );
}
