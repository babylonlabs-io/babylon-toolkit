import { Avatar, Loader } from "@babylonlabs-io/core-ui";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { type ActivityLog, PENDING_DEPOSIT_TYPE } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatDateTime } from "@/utils/formatting";

const SPINNER_SIZE = 16;

interface ActivityCardProps {
  row: ActivityLog;
}

export function ActivityCard({ row }: ActivityCardProps) {
  const isPending = Boolean(row.isPending);
  const isExpired = Boolean(row.isExpired);
  const showSpinner = isPending && !isExpired;
  const showHash = row.transactionHash !== "";

  // PENDING_DEPOSIT_TYPE is an internal type used to keep pending peg-ins out
  // of the filter menu; the row itself reads as a normal "Deposit" with a spinner.
  const displayLabel = row.type === PENDING_DEPOSIT_TYPE ? "Deposit" : row.type;

  const mutedTextClass = isPending
    ? "text-accent-secondary"
    : "text-accent-primary";
  // Pending rows sit on the darker contrast background to distinguish them
  // from settled activity, which uses the lighter highlight background.
  const backgroundClass = isPending
    ? "bg-primary-contrast"
    : "bg-secondary-highlight";

  return (
    <article
      className={`flex items-center justify-between gap-4 rounded-2xl p-6 ${backgroundClass}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Avatar url={row.tokenIcon} alt={row.amount.symbol} size="large" />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-xl leading-none ${mutedTextClass}`}>
              {displayLabel}
            </span>
            {isExpired ? (
              <span
                role="img"
                aria-label={COPY.activity.expiredTooltip}
                title={COPY.activity.expiredTooltip}
                className="inline-block size-3 rounded-full bg-error-main"
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
            <span className="text-sm italic text-accent-secondary">
              {COPY.activity.hashPending}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className={`text-base ${mutedTextClass}`}>
          {row.amount.value} {row.amount.symbol}
        </span>
        <span className="text-xs text-accent-secondary">
          {formatDateTime(row.date)}
        </span>
      </div>
    </article>
  );
}
