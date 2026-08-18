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

import { CARD_SHELL_CLASS } from "@/components/shared/layoutClasses";

/**
 * A lifecycle-row cell other than the leading one. Every cell grows, so the
 * card's slack spreads evenly across the row instead of pooling in the last
 * cell and opening a gap before the trailing action button.
 *
 * The basis is the widest cell's intrinsic content — the status cell's 12px
 * dot, 108px label and 16px info icon with their 4px gaps. Keeping it that
 * tight matters: `flex-wrap` breaks lines on the basis and never shrinks to
 * avoid a break, so every extra pixel here raises the viewport width at which
 * the action button drops onto a second line. 120px is the floor below which
 * wrapping is preferable to squashing.
 */
export const LIST_ROW_COLUMN_CLASS = "min-w-[120px] grow basis-[144px]";

/**
 * The status cell. Same basis as a plain data column — so the viewport width at
 * which the action button wraps is unchanged — but it takes a double share of
 * the leftover slack, matching the leading cell.
 *
 * Slack was previously split 2:1:1:1 between the leading, status, provider and
 * hash cells, which left the leading cell roomy while the status label wrapped:
 * the basis above is sized for a 108px label, and the longest status is now
 * `COPY.pegin.statusLabel.AWAITING_ACTIVATION_WINDOW`. Widening the basis would
 * have fixed the wrap at every width but raised the action button's wrap
 * threshold, which the comment above deliberately keeps as low as possible.
 * Grow factors divide only the surplus, so they cost nothing at narrow widths.
 */
export const LIST_ROW_STATUS_COLUMN_CLASS =
  "min-w-[120px] grow-[2] basis-[144px]";

/**
 * The leading cell — a logo beside a two-line amount / sub-line block. Its
 * basis fits the longest sub-line the rows produce (the refund-maturity
 * notice from `COPY.vaults.statusHints.refundMaturing`, measured at 343px in
 * the app's 12px face) plus the 32px logo and its 8px gap, so that copy reads
 * in full rather than ellipsing. It takes a double share of any remaining
 * slack.
 *
 * That 343px is one measurement of an interpolated string — the block count,
 * the hours and the block/blocks plural all vary — so a longer combination
 * ellipses again. `copy.ts` points back here for that reason; re-measure both
 * together.
 */
export const LIST_ROW_LEADING_COLUMN_CLASS =
  "min-w-[120px] grow-[2] basis-[384px]";

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
 * `LIST_ROW_MIN_HEIGHT_CLASS`; the single-line lists pass nothing.
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
      className={`${CARD_SHELL_CLASS} flex flex-wrap items-center gap-x-4 gap-y-3 p-4 ${className}`}
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
