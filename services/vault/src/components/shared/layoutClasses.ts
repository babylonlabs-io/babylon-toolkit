/**
 * Shared Tailwind class fragments for the vault's page layout and cards.
 * Keeping these in one place stops the values drifting between components.
 */

/**
 * Max content width + horizontal padding shared by the navbar and every top-level
 * page container. 1080px matches the Figma entry-screen content box (180px side
 * margins on the 1440 frame); `!` overrides core-ui `<Container>`/`Header`'s
 * default `container` width so the navbar and body stay the same width.
 */
export const PAGE_CONTENT_CLASS = "!max-w-[1080px] px-5 sm:px-5";

/** Width + vertical padding for the dashboard section summary cards. */
export const SUMMARY_CARD_CLASS = "w-full border-0 !py-[34px]";
