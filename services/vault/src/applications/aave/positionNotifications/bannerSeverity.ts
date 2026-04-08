import type { CalculatorResult, Warning } from "./types";

export type BannerSeverity = "red" | "yellow" | "green" | "hidden";

export interface BannerState {
  severity: BannerSeverity;
  primaryWarning: Warning | null;
  secondaryWarnings: Warning[];
}

const RED_WARNING_TYPES = new Set(["urgent", "cliff", "dust"]);
const STRUCTURAL_WARNING_TYPES = new Set(["cliff", "reorder", "rebalance"]);

/**
 * Map a CalculatorResult to a banner display state.
 *
 * Red:    urgent, cliff, or dust warnings present
 * Yellow: only reorder or rebalance warnings, >5% from liquidation
 * Green:  no warnings, >5% from liquidation
 * Hidden: no debt or no groups
 */
export function deriveBannerState(result: CalculatorResult): BannerState {
  const { warnings, groups } = result;

  if (groups.length === 0) {
    return { severity: "hidden", primaryWarning: null, secondaryWarnings: [] };
  }

  if (warnings.length === 0) {
    return { severity: "green", primaryWarning: null, secondaryWarnings: [] };
  }

  const redWarnings = warnings.filter((w) => RED_WARNING_TYPES.has(w.type));
  const structuralWarnings = warnings.filter((w) =>
    STRUCTURAL_WARNING_TYPES.has(w.type),
  );
  const infoWarnings = warnings.filter((w) => w.type === "weird-params");

  // Red severity: urgent, cliff, or dust
  if (redWarnings.length > 0) {
    // Urgent takes priority as primary, structural shown as secondary
    const urgent = redWarnings.find((w) => w.type === "urgent");
    const primary = urgent ?? redWarnings[0];
    const secondary = warnings.filter((w) => w !== primary);
    return {
      severity: "red",
      primaryWarning: primary,
      secondaryWarnings: secondary,
    };
  }

  // Yellow severity: reorder or rebalance only
  if (structuralWarnings.length > 0) {
    return {
      severity: "yellow",
      primaryWarning: structuralWarnings[0],
      secondaryWarnings: infoWarnings,
    };
  }

  // Only weird-params — show as yellow with info
  if (infoWarnings.length > 0) {
    return {
      severity: "yellow",
      primaryWarning: infoWarnings[0],
      secondaryWarnings: [],
    };
  }

  return { severity: "green", primaryWarning: null, secondaryWarnings: [] };
}
