import { Avatar, Hint, InfoIcon } from "@babylonlabs-io/core-ui";
import { Fragment, type ReactNode } from "react";

import type { BorrowedAsset } from "@/applications/aave/hooks/useAaveBorrowedAssets";
import {
  isAtBorrowReserveLimit,
  type BorrowReserveLimit,
} from "@/applications/aave/utils";
import { COPY } from "@/copy";

export interface PositionStatCard {
  id?: string;
  label: string;
  /** Rendered before the label/value column (e.g. the borrowed asset's icon). */
  leading?: ReactNode;
  tooltip?: ReactNode;
  value: string;
  /** Custom value rendering (e.g. colored health factor + heart). When set it
   *  is drawn in place of `value`, but `value` still supplies the row's `title`
   *  tooltip — so it must carry the same text the node draws. */
  valueNode?: ReactNode;
  caption?: string;
  /** Action button. Omit all three to render a card with no button. */
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  /** Optional test hook for the action button (E2E real-wallet CLI). */
  actionTestId?: string;
}

function StatSection({ card }: { card: PositionStatCard }) {
  const hasAction = card.actionLabel != null && card.onAction != null;
  return (
    // Both min-w-0 are load-bearing: they lift the min-width:auto content floor
    // on the section and the column so a long value can truncate (#2428).
    <div
      id={card.id}
      className="flex min-w-0 flex-1 items-center justify-between gap-4 xl:max-[1439px]:gap-2"
    >
      <div className="flex min-w-0 items-center gap-3">
        {card.leading}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-1 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary xl:whitespace-nowrap">
            {card.tooltip ? (
              <Hint
                tooltip={card.tooltip}
                icon={<InfoIcon size={16} className="text-accent-secondary" />}
              >
                <span className="text-accent-secondary">{card.label}</span>
              </Hint>
            ) : (
              card.label
            )}
          </div>

          <span
            title={card.value}
            className="flex items-center gap-2 overflow-hidden text-xl leading-[1.6] tracking-[0.15px] text-accent-primary xl:whitespace-nowrap"
          >
            {card.valueNode ?? (
              <span className="xl:truncate">{card.value}</span>
            )}
          </span>

          {card.caption ? (
            <span
              title={card.caption}
              className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary xl:truncate"
            >
              {card.caption}
            </span>
          ) : null}
        </div>
      </div>

      {hasAction && (
        <button
          type="button"
          onClick={() => card.onAction?.()}
          disabled={card.actionDisabled}
          data-testid={card.actionTestId}
          className="flex h-10 w-[120px] shrink-0 items-center justify-center rounded-lg bg-secondary-strokeLight text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-secondary xl:max-[1439px]:w-[100px]"
        >
          {card.actionLabel}
        </button>
      )}
    </div>
  );
}

export function PositionStatCards({ cards }: { cards: PositionStatCard[] }) {
  return (
    <div className="rounded-lg bg-secondary-highlight p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:max-[1439px]:gap-4">
        {cards.map((card, index) => (
          <Fragment key={card.label}>
            {index > 0 && (
              <div className="h-px w-full self-center bg-secondary-strokeLight xl:h-16 xl:w-px" />
            )}
            <StatSection card={card} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** 48px avatar slot the Borrowed Asset card leads with. */
const BORROWED_ASSET_AVATAR_CLASS = "h-12 w-12 shrink-0 rounded-full";

/** The plus glyph's rendered size and stroke, per the design's 24px icon. */
const PLACEHOLDER_ICON_SIZE_PX = 24;
const PLACEHOLDER_ICON_STROKE_WIDTH = 1.5;

/**
 * Placeholder shown until the position is tied to an asset: a dashed ring
 * around a plus, in place of the token icon that replaces it after the borrow.
 */
function BorrowedAssetPlaceholder() {
  return (
    <div
      className={`${BORROWED_ASSET_AVATAR_CLASS} flex items-center justify-center border border-dashed border-secondary-strokeDark bg-secondary-strokeLight text-accent-secondary`}
      aria-hidden="true"
    >
      <svg
        width={PLACEHOLDER_ICON_SIZE_PX}
        height={PLACEHOLDER_ICON_SIZE_PX}
        viewBox="0 0 24 24"
        fill="none"
      >
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth={PLACEHOLDER_ICON_STROKE_WIDTH}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Builds the two borrow-capacity summary cards — "Available to Borrow" and
 * "Borrowed Asset" — shared by the Overview position summary and the Loans
 * page.
 *
 * Aave caps how many reserves a position may borrow, so the second card names
 * the asset the position is tied to rather than totalling its debt. The cap
 * itself only reaches the tooltip, and only while the spoke sets one.
 */
export function buildBorrowCapacityCards({
  availableToBorrow,
  borrowedAssets,
  maxBorrowReserves,
  borrowCount,
  borrowCapacityLoading,
  borrowCapacityError,
  onBorrow,
  onRepay,
  canBorrow,
  canRepay,
  borrowTestId,
  repayTestId,
}: {
  availableToBorrow: string;
  /** Assets the position currently owes; empty before the first borrow. */
  borrowedAssets: Pick<BorrowedAsset, "symbol" | "name" | "icon">[];
  /** The spoke's borrow-reserve cap; `null` when it sets none. */
  maxBorrowReserves: BorrowReserveLimit;
  /**
   * The Spoke's own borrow-reserve counter, the number its borrow check
   * compares. `null` while the position is unknown. Not derived from the
   * resolved debts: a premium-only residue keeps a reserve in that list after
   * the Spoke has stopped counting it, and the card must not disagree with
   * the pickers about the same fact.
   */
  borrowCount: bigint | null;
  borrowCapacityLoading: boolean;
  borrowCapacityError: Error | null;
  onBorrow: () => void;
  onRepay: () => void;
  canBorrow: boolean;
  canRepay: boolean;
  /** Optional E2E test hooks for the borrow / repay action buttons. */
  borrowTestId?: string;
  repayTestId?: string;
}): PositionStatCard[] {
  const availableValue = borrowCapacityLoading
    ? COPY.common.loading
    : borrowCapacityError
      ? COPY.common.emptyValue
      : availableToBorrow;

  const [firstBorrowed] = borrowedAssets;
  // Three states, not two: nothing borrowed yet, room left after a borrow, and
  // no room left. With no cap, or while the Spoke's count is unknown, the card
  // claims none of them.
  const atCap =
    borrowCount !== null &&
    isAtBorrowReserveLimit(maxBorrowReserves, borrowCount);
  // Keyed to the Spoke's counter, the same one `atCap` reads. `borrowedAssets`
  // resolves debt positions without the `drawnShares > 0n` filter, so a
  // premium-only residue would pick the "slots left" copy for an account the
  // Spoke counts as borrowing nothing.
  const borrowedTooltipBefore =
    maxBorrowReserves === null || borrowCount === null || atCap
      ? null
      : borrowCount > 0n
        ? COPY.overview.borrowedAssetTooltipRemaining(
            maxBorrowReserves,
            Number(borrowCount),
          )
        : COPY.overview.borrowedAssetTooltipBefore(maxBorrowReserves);

  return [
    {
      label: COPY.overview.availableToBorrowLabel,
      value: availableValue,
      actionLabel: COPY.overview.borrowAction,
      onAction: onBorrow,
      actionDisabled: !canBorrow,
      actionTestId: borrowTestId,
    },
    {
      label: COPY.overview.borrowedAssetLabel,
      leading: firstBorrowed ? (
        <Avatar
          url={firstBorrowed.icon}
          alt={firstBorrowed.name}
          size="large"
          variant="circular"
          className={`${BORROWED_ASSET_AVATAR_CLASS} bg-white`}
        />
      ) : (
        <BorrowedAssetPlaceholder />
      ),
      tooltip:
        atCap && maxBorrowReserves !== null ? (
          COPY.overview.borrowedAssetTooltipAfter(maxBorrowReserves)
        ) : borrowedTooltipBefore ? (
          <span className="flex flex-col gap-1">
            <span className="font-bold">{borrowedTooltipBefore.title}</span>
            <span>{borrowedTooltipBefore.body}</span>
          </span>
        ) : undefined,
      value: firstBorrowed
        ? COPY.overview.borrowedAssetValue(borrowedAssets.map((a) => a.symbol))
        : COPY.overview.borrowedAssetEmpty,
      actionLabel: COPY.overview.repayAction,
      onAction: onRepay,
      actionDisabled: !canRepay,
      actionTestId: repayTestId,
    },
  ];
}
