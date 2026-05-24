/**
 * Shared Tailwind class fragments for the vault's page layout and cards.
 * Keeping these in one place stops the values drifting between components.
 */

/** Max content width + horizontal padding shared by the navbar and every top-level page container. */
export const PAGE_CONTENT_CLASS = "max-w-[1400px] px-5 sm:px-5";

/** Dark-mode background for every filled dashboard card (light mode stays bg-secondary-highlight). */
export const CARD_DARK_BG_CLASS = "dark:bg-[#202020]";

/** Width + vertical padding for the dashboard section summary cards. */
export const SUMMARY_CARD_CLASS = "w-full border-0 !py-[34px]";
