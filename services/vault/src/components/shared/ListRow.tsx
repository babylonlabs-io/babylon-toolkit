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
export const LIST_ROW_COLUMN_CLASS = "min-w-[120px] shrink grow basis-[144px]";

/**
 * The leading cell — a logo beside a two-line amount / sub-line block. Its
 * basis fits the longest sub-line the rows produce (the refund-maturity
 * notice, measured at 343px in the app's 12px face) plus the 32px logo and its
 * 8px gap, so that copy reads in full rather than ellipsing. It takes a double
 * share of any remaining slack, and gives width back proportionally when the
 * viewport is too narrow for every cell to sit at its basis.
 */
export const LIST_ROW_LEADING_COLUMN_CLASS =
  "min-w-[120px] shrink grow-[2] basis-[384px]";

/**
 * Trailing action cell. Rows whose action is conditional reserve it anyway, so
 * a row without a button still lines its cells up with the rows that have one.
 * The width matches `ROW_BUTTON_MIN_WIDTH_PX`, spelled literally because
 * Tailwind only emits classes it can find as whole strings in the source.
 */
export const LIST_ROW_ACTION_SLOT_CLASS =
  "flex min-w-[120px] shrink-0 justify-end";

/**
 * Every lifecycle row stands the same height so the Pending / Active /
 * Inactive sections read as one table rather than three — otherwise a row
 * whose leading cell has no sub-line, or whose status cell has no progress
 * bar, sits shorter than its neighbours. The tallest cell is two lines (a 24px
 * amount over a 20px sub-line); this is that 44px plus the card's 16px padding
 * and 1px border on each side, since the box is border-box.
 */
export const LIST_ROW_MIN_HEIGHT_CLASS = "min-h-[78px]";

/** Bordered row card shared by the vault and loan lists. */
export function ListRowCard({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`${CARD_SHELL_CLASS} ${LIST_ROW_MIN_HEIGHT_CLASS} flex flex-wrap items-center gap-x-4 gap-y-3 p-4`}
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
