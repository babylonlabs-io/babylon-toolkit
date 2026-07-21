/**
 * Shared button classes for the v3 /vaults page (issue #2041), following the
 * shipped v3 neutral-button pattern (see PositionStatCards): a fixed-height
 * gray action button; core-ui Button has no variant producing this style.
 * Widths are minimums — longer state-derived labels (e.g. "Broadcast
 * Pre-Pegin") grow the button on one line instead of wrapping.
 */

/** 40px-tall neutral action button (summary card). */
export const NEUTRAL_BUTTON_CLASS =
  "flex h-10 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-strokeLight px-6 text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled";

/** 36px-tall neutral action button (list rows). `ml-auto` keeps it flush
 *  right on whatever line it lands on when the row wraps. */
export const NEUTRAL_ROW_BUTTON_CLASS =
  "ml-auto flex h-9 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-strokeLight px-4 text-sm leading-[1.43] tracking-[0.17px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled";

/** 36px-tall primary (orange) action button (list rows). */
export const PRIMARY_ROW_BUTTON_CLASS =
  "ml-auto flex h-9 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-main px-4 text-sm leading-[1.43] tracking-[0.17px] text-accent-contrast transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30";
