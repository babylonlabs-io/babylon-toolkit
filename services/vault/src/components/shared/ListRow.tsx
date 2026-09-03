/**
 * Shared row primitives for the v3 list surfaces (Active Vaults, Active
 * Loans). Both pages render the same row: a bordered 8px-radius card with a
 * leading asset block, fixed-width label/value metrics, and trailing action
 * buttons. Keeping the chrome here stops the two lists drifting apart.
 *
 * Not a core-ui component: the pattern is vault-app specific and core-ui has
 * no card variant with this border/background pair.
 */

import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { CARD_SHELL_CLASS } from "@/components/shared/layoutClasses";

/**
 * A lifecycle-row cell other than the leading one. Every cell grows, so the
 * card's slack spreads evenly across the row instead of pooling in the last
 * cell and opening a gap before the trailing action button.
 *
 * The basis is the widest cell's intrinsic content — the status cell's 12px
 * dot and 108px label with their 4px gap. `min-w-0` is what lets the cell
 * shrink below that basis: the lifecycle rows are `xl:flex-nowrap`, so from
 * `xl` up the columns absorb any shortfall rather than breaking the action
 * button onto a second line.
 */
export const LIST_ROW_COLUMN_CLASS = "min-w-0 grow basis-[144px]";

/**
 * The status cell. Same basis as a plain data column, but it takes a double
 * share of the leftover slack, matching the leading cell — the longest status
 * (`COPY.pegin.statusLabel.AWAITING_ACTIVATION_WINDOW`) wraps to two lines
 * otherwise. Grow factors divide only the surplus, so they cost nothing once
 * the row is narrow enough that every column is shrinking instead.
 */
export const LIST_ROW_STATUS_COLUMN_CLASS = "min-w-0 grow-[2] basis-[144px]";

/**
 * The leading cell — a 32px coin avatar beside a two-line amount / sub-line
 * block. The basis fits the amount and the sub-lines the rows produce in the
 * common case; longer interpolated sub-lines (notably
 * `COPY.vaults.statusHints.refundMaturing`) truncate rather than widen the
 * cell, since from `xl` up the row may not wrap. It takes a double share of
 * any remaining slack.
 */
export const LIST_ROW_LEADING_COLUMN_CLASS = "min-w-0 grow-[2] basis-[240px]";

/**
 * Trailing action cell. Every lifecycle and activity row routes its action
 * through this slot — including rows that have no action at all — and the slot
 * neither grows nor shrinks. That is what keeps the columns aligned: the slack
 * the data cells divide is `card width - gaps - bases - 168`, identical in
 * every row, so a row whose button says "Broadcast Pre-Pegin" starts its
 * columns in the same place as one that says "Withdraw" or has no button.
 *
 * Sizing an auto-width slot to its own button instead would hand each row a
 * different amount of slack and skew that row's columns by tens of pixels.
 *
 * The 168px basis is the widest 36px row action rounded up: "Broadcast
 * Pre-Pegin" measures 167px at `text-sm` + `tracking-[0.17px]` + `px-4` in Px
 * Grotesk Regular. Adding a longer label to `COPY.pegin.primaryAction` or
 * `COPY.vaults.actions` means re-measuring and widening this.
 */
export const LIST_ROW_ACTION_SLOT_CLASS =
  "flex shrink-0 grow-0 basis-[168px] justify-end";

/**
 * Every lifecycle row stands the same height so the Pending / Active /
 * Inactive sections read as one table rather than three — otherwise a row
 * whose leading cell has no sub-line, or whose status cell has no progress
 * bar, sits shorter than its neighbours. The tallest cell is two lines (a 24px
 * amount over a 20px sub-line); this is that 44px plus the card's 16px padding
 * and 1px border on each side, since the box is border-box.
 *
 * Applied per row rather than inside `ListRowCard`, because that card is also
 * the Activity list's and Active Loans' row. Those are single-line rows that
 * sit at ~70px, and pinning them to 78px would silently retitle two other
 * pages' layout.
 */
export const LIST_ROW_MIN_HEIGHT_CLASS = "min-h-[78px]";

/**
 * Bordered row card shared by the vault, activity and loan lists. `className`
 * carries per-surface layout — the vault lifecycle rows pass
 * `LIST_ROW_MIN_HEIGHT_CLASS` and `xl:flex-nowrap`; the single-line lists pass
 * nothing and keep the wrapping default.
 */
export function ListRowCard({
  children,
  testId,
  className = "",
}: {
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      // Merged, not concatenated: a caller overriding one of the shell's own
      // utilities (the activity feed drops the fill on a refunded row) must win
      // regardless of where the two classes land in the generated stylesheet.
      className={twMerge(
        `${CARD_SHELL_CLASS} flex flex-wrap items-center gap-x-4 gap-y-3 p-4`,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Label over value, on the fixed column width the rows align to. */
export function ListRowMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    // Flexes rather than pinning the design's 190px: at the app's container
    // width three fixed columns plus the asset block and two action buttons
    // overflow, wrapping the buttons onto a second line.
    <div className="flex min-w-[120px] flex-1 flex-col">
      <span className="text-xs leading-[1.4] tracking-[0.4px] text-accent-secondary">
        {label}
      </span>
      <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-primary">
        {value}
      </span>
    </div>
  );
}
