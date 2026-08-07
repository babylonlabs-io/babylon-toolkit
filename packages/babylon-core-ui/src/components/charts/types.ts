/** A chart axis tick. The app pre-formats `label`; core-ui never formats. */
export interface ChartAxisTick {
  value: number;
  label: string;
}

/** Background grid configuration, shared by every chart. */
export interface ChartGridConfig {
  /** Which gridlines render. Default `"both"`. */
  lines?: "both" | "horizontal" | "none";
  /** Gridline stroke style. Default `"dashed"`. */
  style?: "dashed" | "dotted" | "solid";
}
