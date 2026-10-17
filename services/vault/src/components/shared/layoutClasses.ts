/**
 * Shared Tailwind class fragments for the vault's page layout and cards.
 * Keeping these in one place stops the values drifting between components.
 */

/**
 * Horizontal inset of a full-screen modal's top bar. Figma's shared Header
 * component puts its content 120px from each edge, unchanged across the 1440
 * and 1512 frames, so every modal's close / network / settings land in the
 * same place. Below `md` that gutter would swallow a phone screen, so it drops
 * to the phone page gutter there.
 *
 * Uses margins so the top bar keeps this inset without the page width cap.
 */
export const MODAL_TOP_BAR_GUTTER_CLASS = "mx-4 md:mx-[120px]";

/**
 * Content width + horizontal inset shared by the navbar and every top-level page
 * container; `!` overrides core-ui `<Container>`/`Header`'s default `container`
 * width so the navbar and body stay the same width.
 *
 * Centers a full-width box capped at 1360px. The 40px inner gutters leave
 * 1280px for content. The phone gutter is 16px, per Figma 12031:122516.
 */
export const PAGE_CONTENT_CLASS =
  "!w-full !max-w-[1360px] !px-4 md:!px-10 mx-auto";

/**
 * Content box of the entry screen, which hides the sidebar and so has no column
 * to fill. 1280px cap with the 40px gutter puts the content at Figma's 1200px
 * wide, 120px from each edge of the 1440 frame; the gutter is 16px on phone.
 * Shared by the navbar, the page body and the footer so the three stay
 * aligned; the header's own divider sits outside this box and stays full-bleed.
 */
export const ENTRY_CONTENT_CLASS =
  "!w-auto !max-w-[1280px] !px-4 md:!px-10 mx-auto";

/** Width + vertical padding for the dashboard section summary cards. */
export const SUMMARY_CARD_CLASS = "w-full border-0 !py-[34px]";

/**
 * Chrome of a v3 list card — border, radius, surface — with no padding or
 * layout of its own. For a single row prefer `ListRowCard`, which adds that
 * row's padding and flex; this is for a card holding several
 * divider-separated rows, where the padding belongs to the card.
 */
export const CARD_SHELL_CLASS =
  "w-full overflow-hidden rounded-lg border border-secondary-strokeLight bg-secondary-highlight dark:bg-[#202020]";

export const DETAIL_PANEL_CLASS =
  "flex flex-col gap-2 rounded-lg border border-secondary-strokeLight bg-background-contrast p-3";

/**
 * Box holding the liquidation Timeline's loading spinner. The 1016/350 ratio is
 * core-ui's default plot aspect, so the spinner occupies about the height the
 * chart will take: the y-axis gutter shortens the plot and the x-axis row adds
 * to it by roughly the same amount, so the two nearly cancel.
 */
export const CHART_LOADING_BOX_CLASS =
  "flex aspect-[1016/350] w-full items-center justify-center";
