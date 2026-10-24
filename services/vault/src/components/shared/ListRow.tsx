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
 * dot and 108px label with their 4px gap. From `xl` up the lifecycle rows are
 * `xl:flex-nowrap`: when the bases plus the gaps and the fixed trailing cell
 * exceed the row's width (below about a 1392px viewport, with the 242px
 * sidebar), the data cells shrink in proportion to their bases — identically
 * in every row, so the columns still line up — and their text truncates or
 * wraps. Below `xl` the row wraps instead.
 */
export const LIST_ROW_COLUMN_CLASS = "min-w-0 grow basis-[144px]";

/**
 * The status cell. Same basis as a plain data column, but it takes a double
 * share of the leftover slack, matching the leading cell — the longest status
 * (`COPY.pegin.labels.AWAITING_ACTIVATION_WINDOW`) wraps to two lines
 * otherwise. Grow factors divide only the surplus, so they cost nothing once
 * the row is narrow enough that every column is shrinking instead.
 */
export const LIST_ROW_STATUS_COLUMN_CLASS = "min-w-0 grow-[2] basis-[144px]";

/**
 * The leading cell — a 32px coin avatar beside a two-line amount / sub-line
 * block. The basis fits the amount and the sub-lines the rows produce in the
 * common case; longer interpolated sub-lines (notably
 * `COPY.pegin.messages.refundMaturing`) truncate rather than widen the cell,
 * because widening it would take width from the other data cells in every row.
 * It takes a double share of any remaining slack.
 */
export const LIST_ROW_LEADING_COLUMN_CLASS = "min-w-0 grow-[2] basis-[240px]";

/**
 * The Activity row's action cell. It neither grows nor shrinks, so the slack
 * the data cells divide is `card width - gaps - bases - 168`, identical in
 * every Activity row that carries an action, whatever the button says.
 *
 * The 168px basis fits any 36px row action — the widest label, "Broadcast
 * Pre-Pegin", measures 167px at `text-sm` + `tracking-[0.17px]` + `px-4` in Px
 * Grotesk Regular. The Activity row renders `COPY.vaults.actions` labels here;
 * adding a longer one means re-measuring and widening this.
 */
export const LIST_ROW_ACTION_SLOT_CLASS =
  "flex shrink-0 grow-0 basis-[168px] justify-end";

/**
 * The trailing cell of every vault lifecycle row. Each row reserves the same
 * 300px, so the data columns share identical slack and line up across the
 * Pending / Total Collateral / Inactive sections. 300 is the widest trailing
 * content a row renders today — Download artifacts beside a 120px action,
 * about 298px — rounded up, so the rows fit without squeezing the data cells
 * from about a 1392px viewport (with the 242px sidebar) up. Content wider
 * still (e.g. a longer action label beside Download artifacts) widens that one
 * row through flex `min-width: auto` rather than clipping, so this carries no
 * overflow or `min-w-0`. The row buttons carry `ml-auto` (buttonClasses.ts)
 * for wrapped rows; inside this justify-end cell those auto margins would
 * split the free space between two controls, so `*:ml-0` cancels them and the
 * cell's gap spaces its children.
 */
export const LIST_ROW_TRAILING_CLASS =
  "flex shrink-0 grow-0 basis-[300px] items-center justify-end gap-2 *:ml-0";

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
 * `ListRowCard` override for a row the design draws without the card fill —
 * the inactive vault row (the pending row is its own unfilled div and does not
 * use this); merged via twMerge so it beats `CARD_SHELL_CLASS`'s light and
 * dark fills.
 */
export const LIST_ROW_UNFILLED_CLASS = "bg-transparent dark:bg-transparent";

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
      // utilities must win regardless of where the two classes land in the
      // generated stylesheet.
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
  value: ReactNode;
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
