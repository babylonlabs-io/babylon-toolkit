/**
 * ActivityRowV3
 * A single row inside a v3 date-group card (behind ENABLE_V3_UI). Columns:
 * token icon + amount, a status indicator, the transaction type, the tx-hash
 * link/copy, and a time-only timestamp (the calendar day lives in the group
 * header). The status is derived from the row type plus pending/expired (see
 * `getActivityStatus`). Per-row USD value and the Withdraw button from the
 * Figma frame are deferred (not backed by current activity data).
 */

import { Avatar } from "@babylonlabs-io/core-ui";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { COPY } from "@/copy";
import { type ActivityLog, PENDING_DEPOSIT_TYPE } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatActivityTime } from "@/utils/formatting";

interface ActivityRowV3Props {
  row: ActivityLog;
}

/**
 * Status dot + label for a standard activity row, from current data only:
 * expired (red) and pending (amber) take precedence; otherwise a settled
 * deposit's collateral is "In use" and every other settled action (borrow /
 * repay / withdraw / redeem) is "Done" (both green). This reflects the row
 * type, not a live collateral check. Liquidation rows render separately and
 * never reach here.
 */
function getActivityStatus(row: ActivityLog): {
  dotClass: string;
  label: string;
} {
  if (row.isExpired) {
    return { dotClass: "bg-error-main", label: COPY.activity.statusExpired };
  }
  if (row.isPending) {
    return { dotClass: "bg-warning-main", label: COPY.activity.statusPending };
  }
  const type = row.type === PENDING_DEPOSIT_TYPE ? "Deposit" : row.type;
  if (type === "Deposit") {
    return { dotClass: "bg-success-main", label: COPY.activity.statusInUse };
  }
  return { dotClass: "bg-success-main", label: COPY.activity.statusDone };
}

function StatusIndicator({
  dotClass,
  label,
}: {
  dotClass: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block size-2 rounded-full ${dotClass}`} />
      <span className="text-base text-accent-primary">{label}</span>
    </span>
  );
}

export function ActivityRowV3({ row }: ActivityRowV3Props) {
  const showHash = row.transactionHash !== "";
  const status = getActivityStatus(row);

  // PENDING_DEPOSIT_TYPE is an internal type used to keep pending peg-ins out
  // of the filter menu; the row itself reads as a normal "Deposit".
  const displayLabel = row.type === PENDING_DEPOSIT_TYPE ? "Deposit" : row.type;

  return (
    // A shared grid template (not content-sized flex) so every row's columns
    // line up regardless of amount length — a long "0.00705306 WBTC" no longer
    // pushes the type/hash/time columns out of alignment with shorter rows.
    <div className="grid grid-cols-1 gap-2 p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] lg:items-center lg:gap-6">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar url={row.tokenIcon} alt={row.amount.symbol} size="medium" />
        <span className="whitespace-nowrap text-xl text-accent-primary">
          {row.amount.value} {row.amount.symbol}
        </span>
      </div>

      <div className="min-w-0">
        <StatusIndicator dotClass={status.dotClass} label={status.label} />
      </div>

      <span className="min-w-0 text-base text-accent-primary">
        {displayLabel}
      </span>

      <div className="min-w-0">
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

      <span className="whitespace-nowrap text-sm text-accent-secondary lg:justify-self-end">
        {formatActivityTime(row.date)}
      </span>
    </div>
  );
}
