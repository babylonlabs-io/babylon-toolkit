/**
 * Status dot colors for the v3 activity rows, from the Figma v3 foundation
 * palette (foundation red/a400, amber/600, green/a400, warning/dark) — the same
 * `--risk-*` channels the v3 risk card uses, so the two surfaces can't drift.
 */
export const STATUS_DOT = {
  expired: "bg-risk-red",
  pending: "bg-risk-amber",
  settled: "bg-risk-green",
  liquidated: "bg-risk-orange",
} as const;
