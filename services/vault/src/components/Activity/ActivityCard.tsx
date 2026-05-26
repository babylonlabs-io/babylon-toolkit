import { Avatar, Loader } from "@babylonlabs-io/core-ui";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import type { ActivityLog } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatDateTime } from "@/utils/formatting";

const SPINNER_SIZE = 16;

interface ActivityCardProps {
  row: ActivityLog;
}

export function ActivityCard({ row }: ActivityCardProps) {
  const isPending = Boolean(row.isPending);
  const isRefunded = Boolean(row.isRefunded);
  const showSpinner = isPending && !isRefunded;
  const hasHash = row.transactionHash !== "";
  const showHash = hasHash && !isPending;

  const titleColor = isPending ? "text-accent-secondary" : "text-accent-primary";
  const backgroundClass = isPending
    ? "bg-accent-contrast"
    : "bg-secondary-highlight";

  return (
    <article
      data-pending={String(isPending)}
      className={`flex items-center justify-between gap-4 rounded-[16px] p-6 ${backgroundClass}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Avatar url={row.tokenIcon} alt={row.amount.symbol} size="large" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-[20px] leading-none ${titleColor}`}>
              {row.type}
            </span>
            {isRefunded ? (
              <span
                role="img"
                aria-label={COPY.activity.refundedTooltip}
                title={COPY.activity.refundedTooltip}
                className="inline-block size-2 rounded-full bg-error-main"
              />
            ) : showSpinner ? (
              <span data-testid="activity-card-spinner" className="inline-flex">
                <Loader size={SPINNER_SIZE} className="text-accent-secondary" />
              </span>
            ) : null}
          </div>
          {showHash ? (
            <CopyableHash
              hash={row.transactionHash}
              chain={row.chain}
              explorerUrl={getExplorerTxUrl(row.chain, row.transactionHash)}
            />
          ) : (
            <span className="text-[14px] italic text-accent-secondary">
              {COPY.activity.hashPending}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`text-[16px] ${titleColor}`}>
          {row.amount.value} {row.amount.symbol}
        </span>
        <span className="text-[12px] text-accent-secondary">
          {formatDateTime(row.date)}
        </span>
      </div>
    </article>
  );
}
