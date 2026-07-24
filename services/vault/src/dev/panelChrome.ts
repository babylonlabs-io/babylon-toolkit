/**
 * Shared chrome for the god-mode panel and every debug section rendered inside
 * it (dev / QA only).
 *
 * The panel box is intentionally theme-independent — fixed zinc surfaces, an
 * orange accent, no light-mode variants — so a section styled with its own
 * palette (or with the app's light/dark tokens) reads as a foreign card
 * floating inside the box. Sections use these classes instead of rolling their
 * own, which also keeps the popped-out window (same fixed dark background)
 * looking identical to the floating panel.
 */

/** Small square button (Prev / Next / Hide / Pop out / Reset). */
export const PANEL_BUTTON_CLASS =
  "rounded border border-zinc-600 px-2 py-1 text-xs disabled:opacity-40";

/** Card that groups one section's controls. */
export const PANEL_SECTION_CLASS = "rounded-lg border border-zinc-700/60 p-3";

/** Section heading — also used as a `<summary>` for collapsible sections. */
export const PANEL_SECTION_TITLE_CLASS =
  "cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-400";

/** Text input / number input / select. */
export const PANEL_INPUT_CLASS =
  "w-full min-w-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-100";

/** Label above an input. */
export const PANEL_LABEL_CLASS = "truncate text-xs text-zinc-400";

/** Explanatory sub-text under a control. */
export const PANEL_HINT_CLASS = "text-xs text-zinc-500";

/** Equal-width segmented control button (theme picker, protocol status, …). */
export function panelSegmentClass(active: boolean): string {
  return `flex-1 rounded border px-2 py-1 text-xs ${
    active
      ? "border-orange-500 bg-orange-500/20 text-white"
      : "border-zinc-600 text-zinc-300"
  }`;
}
