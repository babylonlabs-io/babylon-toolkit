import type { CalculatorResult, Warning } from "./types";

/**
 * "yellow" is reserved for the stale-price banner path (driven by a status
 * override, not by a calculator warning). Calculator warnings map to red
 * (urgent), soft (weird-params), green (none), or hidden (dust / no groups).
 */
export type BannerSeverity = "red" | "yellow" | "soft" | "green" | "hidden";

export interface BannerState {
  severity: BannerSeverity;
  primaryWarning: Warning | null;
  secondaryWarnings: Warning[];
  /**
   * The engine found a safer liquidation order than the current on-chain order.
   * Drives the manual "Apply Optimal Order" affordance, independent of the
   * risk warnings — it can accompany an urgent/soft banner or stand alone on an
   * otherwise-healthy position.
   */
  suggestReorder: boolean;
}

/**
 * Map a CalculatorResult to a banner display state.
 *
 * Red:    urgent warning present (already liquidatable or within 5%)
 * Soft:   weird-params (invalid protocol params), or a healthy position whose
 *         vault order is suboptimal — muted gray advisory
 * Green:  no warnings and order already optimal
 * Hidden: no groups, or dust position (too small to matter)
 */
export function deriveBannerState(result: CalculatorResult): BannerState {
  const { warnings, groups } = result;
  const suggestReorder = result.optimalVaultOrder != null;

  // Warnings are evaluated before the "no groups" check so that an advisory
  // with no computable cascade (e.g. weird-params, which leaves groups empty)
  // still renders instead of being hidden.

  // Dust suppresses all other warnings — position is too small to matter.
  const dustWarning = warnings.find((w) => w.type === "dust");
  if (dustWarning) {
    return {
      severity: "hidden",
      primaryWarning: dustWarning,
      secondaryWarnings: [],
      suggestReorder: false,
    };
  }

  // Red severity: urgent takes priority as primary.
  const urgentWarning = warnings.find((w) => w.type === "urgent");
  if (urgentWarning) {
    return {
      severity: "red",
      primaryWarning: urgentWarning,
      secondaryWarnings: warnings.filter((w) => w !== urgentWarning),
      suggestReorder,
    };
  }

  // Soft severity: weird-params advisory.
  const weirdParamsWarning = warnings.find((w) => w.type === "weird-params");
  if (weirdParamsWarning) {
    return {
      severity: "soft",
      primaryWarning: weirdParamsWarning,
      secondaryWarnings: [],
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
