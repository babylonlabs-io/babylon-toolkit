/**
 * ActivityRowV3
 * The activity row body: token icon + the transaction type as the primary
 * label with the asset symbol beneath it, a labelled explorer hash link, a
 * labelled timestamp, and the amount with its USD value right-aligned. An
 * optional action slot is pinned right of the amount.
 *
 * Renders the columns only — the caller supplies the card and its padding, so
 * the same row works standalone (one card per row) and stacked inside a
 * liquidation group's shared card.
 *
 * There is no status column: a pending row spins beside its type label and a
 * refunded deposit gets the Refund chip plus a dimmed row.
 */

import { Avatar, Loader } from "@babylonlabs-io/core-ui";
import type { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

import { LIST_ROW_ACTION_SLOT_CLASS } from "@/components/shared/ListRow";
import { COPY } from "@/copy";
import type { ActivityAmount, ActivityLog } from "@/types/activityLog";
import { getExplorerName, getExplorerTxUrl } from "@/utils/explorer";
import { formatActivityTime } from "@/utils/formatting";

import { ActivityHashLink } from "./ActivityHashLink";
import { getUsdSubLine } from "./usdSubLine";

/** Figma body 2 — the row's primary text (type label, hash, time). */
const PRIMARY_TEXT_CLASS = "text-sm leading-[1.43] tracking-[0.17px]";
/** Figma caption — the sub-lines (symbol, cell labels, USD value). */
const CAPTION_TEXT_CLASS = "text-xs leading-[1.4] tracking-[0.4px]";
/** Figma body 1 — the right-aligned amount. */
const AMOUNT_TEXT_CLASS = "text-base leading-[1.5] tracking-[0.15px]";

/** Every left-hand cell sits on the design's 180px column and may shrink to
 *  half of it before the row wraps. */
const CELL_CLASS = "flex min-w-[90px] shrink grow basis-[180px] flex-col";

/** Matches the 16px `<Progress> | Circular` beside the type label in the
 *  frame. */
const SPINNER_SIZE = 16;

interface ActivityRowV3Props {
  row: ActivityLog;
  /**
   * Current USD price per token symbol (`usePrices().prices`). A row whose
   * symbol is absent from it — or whose amount has no numeric form — renders
   * no USD sub-line.
   */
  prices?: Record<string, number>;
  /** Rendered flush right — the expired deposit's Withdraw, when refundable. */
  action?: ReactNode;
}

export function ActivityRowV3({ row, prices, action }: ActivityRowV3Props) {
  // A deposit that expired before activation and was reclaimed: the design
  // marks it with the Refund chip and dims the whole row.
  const isRefunded = row.isRefunded === true;

  return (
    <ActivityRowLayout
      icon={row.tokenIcon}
      iconAlt={row.amount.symbol}
      // "Pending Deposit" (an internal type kept out of the filter menu) maps
      // to a "Deposit".
      typeLabel={COPY.activity.typeLabels[row.type]}
      amount={row.amount}
      usdValue={getUsdSubLine(row.amount, prices)}
      chain={row.chain}
      transactionHash={row.transactionHash}
      time={formatActivityTime(row.date)}
      isPending={row.isPending === true && !isRefunded}
      chip={isRefunded ? COPY.activity.refundChip : undefined}
      dimmed={isRefunded}
      action={action}
    />
  );
}

interface ActivityRowLayoutProps {
  icon: string;
  iconAlt: string;
  typeLabel: string;
  amount: ActivityAmount;
  /** Null renders no sub-line — see `getUsdSubLine`. */
  usdValue: string | null;
  chain: ActivityLog["chain"];
  /** Empty string renders the pending placeholder instead of a link. */
  transactionHash: string;
  time: string;
  isPending?: boolean;
  /** Status chip beside the type label (e.g. "Refund"). */
  chip?: string;
  /** Fades the row — the caller drops the card fill to match. */
  dimmed?: boolean;
  action?: ReactNode;
}

/** The bare row, without card padding. Exported so the liquidation group can
 *  lay its child events out identically without going through ActivityLog. */
export function ActivityRowLayout({
  icon,
  iconAlt,
  typeLabel,
  amount,
  usdValue,
  chain,
  transactionHash,
  time,
  isPending,
  chip,
  dimmed,
  action,
}: ActivityRowLayoutProps) {
  return (
    <div
      className={twJoin(
        "flex w-full flex-wrap items-center gap-x-10 gap-y-3",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex min-w-[180px] shrink grow-[2] basis-[180px] items-center gap-2">
        {/* `.bbn-avatar` is inline-flex with no shrink-0 of its own, and this
            cell can shrink below its basis — without this a long symbol
            squashes the circle into an ellipse. */}
        <Avatar url={icon} alt={iconAlt} size="medium" className="shrink-0" />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span
              className={`min-w-0 truncate ${PRIMARY_TEXT_CLASS} text-accent-primary`}
            >
              {typeLabel}
            </span>
            {isPending && (
              <span
                role="status"
                aria-label={COPY.activity.pendingLabel}
                className="flex shrink-0 items-center"
              >
                <Loader size={SPINNER_SIZE} className="text-accent-secondary" />
              </span>
            )}
            {chip && (
              <span
                className={`shrink-0 rounded-full bg-secondary-highlight px-3 py-0.5 ${CAPTION_TEXT_CLASS} text-error-dark`}
              >
                {chip}
              </span>
            )}
          </div>
          <span
            className={`truncate ${CAPTION_TEXT_CLASS} text-accent-secondary`}
          >
            {amount.symbol}
          </span>
        </div>
      </div>

      <div className={CELL_CLASS}>
        <span className={`${CAPTION_TEXT_CLASS} text-accent-secondary`}>
          {COPY.activity.explorerLabel(getExplorerName(chain))}
        </span>
        {transactionHash !== "" ? (
          <ActivityHashLink
            hash={transactionHash}
            chain={chain}
            explorerUrl={getExplorerTxUrl(chain, transactionHash)}
          />
        ) : (
          <span
            className={`${PRIMARY_TEXT_CLASS} italic text-accent-secondary`}
          >
            {COPY.activity.hashPending}
          </span>
        )}
      </div>

      <div className={CELL_CLASS}>
        <span className={`${CAPTION_TEXT_CLASS} text-accent-secondary`}>
          {COPY.activity.timeLabel}
        </span>
        <span className={`${PRIMARY_TEXT_CLASS} text-accent-primary`}>
          {time}
        </span>
      </div>

      <div className="flex min-w-[120px] shrink grow basis-[160px] flex-col items-end">
        <span className={`${AMOUNT_TEXT_CLASS} text-accent-primary`}>
          {`${amount.value} ${amount.symbol}`}
        </span>
        {usdValue && (
          <span className={`${CAPTION_TEXT_CLASS} text-accent-secondary`}>
            {usdValue}
          </span>
        )}
      </div>

      {/* Only a refundable expired deposit carries an action; the slot is
          dropped otherwise so the amount stays flush with the card edge, as
          the design draws it. */}
      {action && (
        <div className={`${LIST_ROW_ACTION_SLOT_CLASS} items-center`}>
          {action}
        </div>
      )}
    </div>
  );
}
