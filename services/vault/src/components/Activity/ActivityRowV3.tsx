/**
 * ActivityRowV3
 * The activity row body: token icon + amount, a status
 * indicator, the transaction type, the tx-hash explorer link, and a time-only
 * timestamp (the calendar day lives in the group header), with an optional
 * action slot pinned right. Renders the columns only — the caller supplies the
 * card and its padding, so the same row works standalone (one card per row) and
 * stacked inside a liquidation group's shared card. Per-row USD value from the
 * Figma frame is deferred (not backed by current activity data).
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";

import { COPY } from "@/copy";
import { type ActivityLog, PENDING_DEPOSIT_TYPE } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatActivityTime } from "@/utils/formatting";

import { ActivityHashLink } from "./ActivityHashLink";
import { STATUS_DOT } from "./statusDot";

/** Fixed column width shared by every cell, so rows line up across cards
 *  regardless of amount length (Figma: 180px). */
const COLUMN_CLASS = "flex w-[180px] shrink-0 items-center";

/** Figma body 2 — every cell's text except the deferred USD sub-line. */
const CELL_TEXT_CLASS = "text-sm leading-[1.43] tracking-[0.17px]";

export interface ActivityStatus {
  dotClass: string;
  label: string;
}

interface ActivityRowV3Props {
  row: ActivityLog;
  /** Rendered flush right — the expired deposit's Withdraw, when refundable. */
  action?: ReactNode;
}

/**
 * Status dot + label for a standard activity row, from current data only:
 * expired (red) and pending (amber) take precedence; otherwise a settled
 * deposit's collateral is "In use" and every other settled action (borrow /
 * repay / withdraw / redeem) is "Done" (both green). This reflects the row
 * type, not a live collateral check. Liquidation rows render separately and
 * never reach here.
 */
function getActivityStatus(row: ActivityLog): ActivityStatus {
  if (row.isExpired) {
    return { dotClass: STATUS_DOT.expired, label: COPY.activity.statusExpired };
  }
  if (row.isPending) {
    return { dotClass: STATUS_DOT.pending, label: COPY.activity.statusPending };
  }
  const type = row.type === PENDING_DEPOSIT_TYPE ? "Deposit" : row.type;
  if (type === "Deposit") {
    return { dotClass: STATUS_DOT.settled, label: COPY.activity.statusInUse };
  }
  return { dotClass: STATUS_DOT.settled, label: COPY.activity.statusDone };
}

export function ActivityRowV3({ row, action }: ActivityRowV3Props) {
  return (
    <ActivityRowLayout
      icon={row.tokenIcon}
      iconAlt={row.amount.symbol}
      amount={`${row.amount.value} ${row.amount.symbol}`}
      status={getActivityStatus(row)}
      // The type column label comes from the copy catalog; "Pending Deposit"
      // (an internal type kept out of the filter menu) maps to a "Deposit".
      typeLabel={COPY.activity.typeLabels[row.type]}
      hash={
        row.transactionHash !== "" ? (
          <ActivityHashLink
            hash={row.transactionHash}
            chain={row.chain}
            explorerUrl={getExplorerTxUrl(row.chain, row.transactionHash)}
          />
        ) : (
          <span className={`${CELL_TEXT_CLASS} italic text-accent-secondary`}>
            {COPY.activity.hashPending}
          </span>
        )
      }
      time={formatActivityTime(row.date)}
      action={action}
    />
  );
}

interface ActivityRowLayoutProps {
  icon: string;
  iconAlt: string;
  amount: string;
  status: ActivityStatus;
  typeLabel: string;
  hash: ReactNode;
  time: string;
  action?: ReactNode;
}

/** The bare five-column row, without padding. Exported so the liquidation
 *  group can lay its child events out identically without going through
 *  ActivityLog. */
export function ActivityRowLayout({
  icon,
  iconAlt,
  amount,
  status,
  typeLabel,
  hash,
  time,
  action,
}: ActivityRowLayoutProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-4">
      <div className={`${COLUMN_CLASS} gap-2`}>
        <Avatar url={icon} alt={iconAlt} size="medium" />
        <span
          className={`min-w-0 truncate ${CELL_TEXT_CLASS} text-accent-primary`}
        >
          {amount}
        </span>
      </div>

      <div className={`${COLUMN_CLASS} gap-1`}>
        <span className={`size-3 shrink-0 rounded-full ${status.dotClass}`} />
        <span
          className={`min-w-0 truncate ${CELL_TEXT_CLASS} text-accent-primary`}
        >
          {status.label}
        </span>
      </div>

      <span
        className={`${COLUMN_CLASS} ${CELL_TEXT_CLASS} text-accent-primary`}
      >
        {typeLabel}
      </span>

      <div className={COLUMN_CLASS}>{hash}</div>

      <span
        className={`${COLUMN_CLASS} ${CELL_TEXT_CLASS} text-accent-secondary`}
      >
        {time}
      </span>

      {action && (
        <div className="ml-auto flex shrink-0 items-center">{action}</div>
      )}
    </div>
  );
}
