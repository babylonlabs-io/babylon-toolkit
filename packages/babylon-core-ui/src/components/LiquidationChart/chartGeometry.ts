/**
 * Pixel constants specific to the liquidation charts, lifted out of the old
 * CSS. The generic frame geometry (gutter, plot box, fluid fonts) lives in
 * `charts/chartLayout.ts`.
 */

export const BAND_RADIUS_PX = 2; // --liq-band-radius
export const PILL_PAD_X_PX = 6; // pill padding 0.375rem
export const PILL_PAD_Y_PX = 2; // pill padding 0.125rem
export const PILL_AXIS_GAP_PX = 4; // axis-right pill offset 0.25rem
export const PRICE_LABEL_GAP_PX = 2.4; // price-line label offset 0.15rem
/** Below this fraction from the top, the price label sits under the line so it
 * clears the top legend / price zone instead of overflowing above the plot. */
export const PRICE_LABEL_BELOW_FRAC = 0.08;
export const LEGEND_PAD_X_PX = 8; // legend-seg padding 0.5rem
export const LEGEND_GAP_PX = 2; // top-legend gap
export const BAND_PAD_X_PX = 8; // band padding 0.5rem
export const BAND_PAD_Y_PX = 4; // band padding 0.25rem
export const BAND_LINE_GAP_PX = 2; // band gap 0.125rem
export const SAFEZONE_PAD_X_PX = 12; // safezone padding 0.75rem
export const SAFEZONE_PAD_Y_PX = 8; // safezone padding 0.5rem
export const SAFEZONE_BORDER_PX = 1; // safezone border width
export const SAFEZONE_LINE_GAP_PX = 2; // safezone gap 0.125rem
export const OVERLAY_INSET_PX = 8; // readout/zoom offset 0.5rem

/** Band text-dropout thresholds that were `@container (max-height: …)`
 * queries. Container size queries evaluate the CONTENT box, so callers must
 * compare these against the band height minus its vertical padding.
 * `max-height` matches at exactly the threshold, so the check is `>`, not
 * `>=`. (The safe zone uses a fits-based rule instead — see SeizureGutter.) */
export const DROP_SUBLABEL_MAX_PX = 76;
export const DROP_AMOUNT_MAX_PX = 54;
export const DROP_LABEL_MAX_PX = 26;
