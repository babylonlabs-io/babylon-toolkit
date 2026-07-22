/**
 * Shared Tailwind class fragments for the vault's page layout and cards.
 * Keeping these in one place stops the values drifting between components.
 */

import featureFlags from "@/config/featureFlags";

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
