import type { CalculatorResult, Warning, WarningType } from "./types";

/**
 * Calculator warnings map to red (urgent), yellow (too-many-vaults — the orange
 * warning banner per Figma), soft (everything else advisory), green (none), or
 * hidden (dust / no groups). "yellow" also backs the stale-price banner, which
 * is driven separately by a status override rather than a calculator warning.
 */
export type BannerSeverity = "red" | "yellow" | "soft" | "green" | "hidden";

/**
 * Per-type severity for the primary warning. Anything not listed renders soft.
 */
const SEVERITY_BY_TYPE: Partial<Record<WarningType, BannerSeverity>> = {
  urgent: "red",
  "too-many-vaults": "yellow",
  "max-vaults": "yellow",
};

export interface BannerState {
  severity: BannerSeverity;
  primaryWarning: Warning | null;
  secondaryWarnings: Warning[];
  /**
   * The engine found a safer liquidation order than the current on-chain order.
   * Drives the manual "Apply Optimal Order" affordance, independent of the
   * risk warnings — it can accompany an urgent/cliff banner or stand alone on an
   * otherwise-healthy position.
   */
  suggestReorder: boolean;
}

/**
 * Primary-warning precedence, highest first. `urgent` is the only red severity;
 * the rest render soft. `dust` is handled before this list (it hides the banner
 * entirely). `weird-params` is emitted exclusively, but kept here so it is still
 * selected if present.
 */
const PRIMARY_ORDER: WarningType[] = [
  "urgent",
  "weird-params",
  "cliff",
  "rebalance",
  "max-vaults",
  "too-many-vaults",
  "reorder",
];

/**
 * Map a CalculatorResult to a banner display state.
 *
 * Red:    urgent warning present (already liquidatable or within 5%)
 * Yellow: too-many-vaults (the orange warning banner per Figma)
 * Soft:   any other advisory warning (cliff / rebalance / reorder /
 *         weird-params), or a healthy position whose vault order is suboptimal
 * Green:  no warnings and order already optimal
 * Hidden: no groups, or dust position (too small to matter)
 */
export function deriveBannerState(result: CalculatorResult): BannerState {
  const { warnings, groups } = result;
  const suggestReorder = result.optimalVaultOrder != null;

  // Dust suppresses all other warnings — position is too small to matter —
  // EXCEPT `max-vaults`, a position-capacity fact independent of position size.
  const dustWarning = warnings.find((w) => w.type === "dust");
  const hasMaxVaults = warnings.some((w) => w.type === "max-vaults");
  if (dustWarning && !hasMaxVaults) {
    return {
      severity: "hidden",
      primaryWarning: dustWarning,
      secondaryWarnings: [],
      suggestReorder: false,
    };
  }

  // Pick the highest-precedence warning as primary; the rest become secondary.
  // `dust` is never surfaced (not in PRIMARY_ORDER, and excluded from secondary)
  // — when it coexists with `max-vaults` the latter is shown alone.
  const primaryWarning =
    PRIMARY_ORDER.map((type) => warnings.find((w) => w.type === type)).find(
      (w): w is Warning => w !== undefined,
    ) ?? null;

  if (primaryWarning) {
    return {
      severity: SEVERITY_BY_TYPE[primaryWarning.type] ?? "soft",
      primaryWarning,
      secondaryWarnings: warnings.filter(
        (w) => w !== primaryWarning && w.type !== "dust",
      ),
      suggestReorder,
    };
  }

  // No risk warnings. Without a position/cascade there is nothing to show.
  if (groups.length === 0) {
    return {
      severity: "hidden",
      primaryWarning: null,
      secondaryWarnings: [],
      suggestReorder: false,
    };
  }

  // Healthy position: a suboptimal order is a soft, standalone suggestion;
  // otherwise the position is optimally structured.
  if (suggestReorder) {
    return {
      severity: "soft",
      primaryWarning: null,
      secondaryWarnings: [],
      suggestReorder: true,
    };
  }

  return {
    severity: "green",
    primaryWarning: null,
    secondaryWarnings: [],
    suggestReorder: false,
  };
}
