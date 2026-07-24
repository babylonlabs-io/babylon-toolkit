/**
 * Shared Tailwind class fragments for the vault's page layout and cards.
 * Keeping these in one place stops the values drifting between components.
 */

import featureFlags from "@/config/featureFlags";

/**
 * Horizontal inset of a full-screen modal's top bar. Figma's shared Header
 * component puts its content 120px from each edge, unchanged across the 1440
 * and 1512 frames, so every modal's close / network / settings land in the
 * same place. Below `md` that gutter would swallow a phone screen, so it drops
 * to the page gutter there.
 *
 * A margin, and deliberately not PAGE_CONTENT_CLASS: that class carries
 * `!w-auto` to undo a core-ui `container`, and on an ordinary element the
 * `!important` beats `w-full` and collapses the box to its content width.
 */
export const MODAL_TOP_BAR_GUTTER_CLASS = "mx-10 md:mx-[120px]";

/**
 * Content width + horizontal inset shared by the navbar and every top-level page
 * container; `!` overrides core-ui `<Container>`/`Header`'s default `container`
 * width so the navbar and body stay the same width.
 *
 * v2 caps the box at 1080px (the entry screen's 180px side margins on a 1440
 * frame). v3 fills the column beside the sidebar with a flat 40px gutter, as a
 * margin rather than padding so the content itself keeps the full width —
 * `!w-auto` is what lets the margin shrink the box, since `container` would
 * otherwise hold it at `width: 100%` and overflow by the gutter.
 */
export const PAGE_CONTENT_CLASS = featureFlags.isV3UiEnabled
  ? "!w-auto !max-w-none !px-0 mx-10"
  : "!max-w-[1080px] px-5 sm:px-5";

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
