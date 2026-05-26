import { Avatar, CopyIcon, Loader, useCopy } from "@babylonlabs-io/core-ui";

import { COPY } from "@/copy";
import type { ActivityLog } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatDateTime } from "@/utils/formatting";

const HASH_TRUNCATE_HEAD = 5;
const HASH_TRUNCATE_TAIL = 5;
const COPY_ICON_SIZE = 16;
const SPINNER_SIZE = 16;

function truncateHashForCard(hash: string): string {
  if (hash.length <= HASH_TRUNCATE_HEAD + HASH_TRUNCATE_TAIL) return hash;
  return `${hash.slice(0, HASH_TRUNCATE_HEAD)}…${hash.slice(-HASH_TRUNCATE_TAIL)}`;
}

interface ActivityCardProps {
  row: ActivityLog;
}

export function ActivityCard({ row }: ActivityCardProps) {
  const { copyToClipboard } = useCopy();
  const isPending = Boolean(row.isPending);
  const isRefunded = Boolean(row.isRefunded);
  const showSpinner = isPending && !isRefunded;
  const hasHash = row.transactionHash !== "";
  const showAnchor = hasHash && !isPending;

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
          <div className="flex items-center gap-2 text-[14px] text-accent-secondary">
            {showAnchor ? (
              <a
                href={getExplorerTxUrl(row.chain, row.transactionHash)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-accent-secondary hover:text-accent-primary"
              >
                {truncateHashForCard(row.transactionHash)}
              </a>
            ) : (
              <span className="italic">{COPY.activity.hashPending}</span>
            )}
            {hasHash && (
              <button
                type="button"
                aria-label="Copy transaction hash"
                onClick={() =>
                  copyToClipboard(row.transactionHash, row.transactionHash)
                }
                className="flex cursor-pointer items-center text-accent-secondary transition-colors hover:text-accent-primary"
              >
                <CopyIcon size={COPY_ICON_SIZE} />
              </button>
            )}
          </div>
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
