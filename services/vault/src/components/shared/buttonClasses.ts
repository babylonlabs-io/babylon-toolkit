/** Shared v3 action-button classes. Widths are minimums so long labels grow
 *  the button on one line instead of wrapping. */

/** 40px-tall neutral action button. */
export const NEUTRAL_BUTTON_CLASS =
  "flex h-10 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-strokeLight px-6 text-base leading-[1.5] tracking-[0.15px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled";

/** 40px-tall primary (orange) action button. */
export const PRIMARY_BUTTON_CLASS =
  "flex h-10 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-main px-6 text-base leading-[1.5] tracking-[0.15px] text-accent-contrast transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30";

/** 36px-tall neutral action button. `ml-auto` keeps it flush right when the
 *  row wraps. */
export const NEUTRAL_ROW_BUTTON_CLASS =
  "ml-auto flex h-9 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-strokeLight px-4 text-sm leading-[1.43] tracking-[0.17px] text-accent-primary transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-accent-disabled";

/** 36px-tall primary (orange) action button. */
export const PRIMARY_ROW_BUTTON_CLASS =
  "ml-auto flex h-9 min-w-[120px] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-secondary-main px-4 text-sm leading-[1.43] tracking-[0.17px] text-accent-contrast transition-[filter] enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30";
