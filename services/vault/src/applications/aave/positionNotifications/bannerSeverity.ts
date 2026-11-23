import { isFirstEventGapped } from "./calculate";
import type { CalculatorResult, Warning, WarningType } from "./types";

/** Display severity for calculator warnings and status overrides. */
export type BannerSeverity = "red" | "yellow" | "soft" | "green" | "hidden";

/** Map primary warnings to severity. Other warning types use soft. */
const SEVERITY_BY_TYPE: Partial<Record<WarningType, BannerSeverity>> = {
  urgent: "red",
  "wbtc-debt": "yellow",
  cliff: "yellow",
  "too-many-vaults": "yellow",
};

export interface BannerState {
  severity: BannerSeverity;
  primaryWarning: Warning | null;
  secondaryWarnings: Warning[];
  /**
   * The engine found a safer liquidation order than the current on-chain order.
   * Drives the manual "Apply Optimal Order" affordance, independent of the
   * risk warnings — it can accompany an urgent/cliff banner or stand alone on an
   * otherwise-healthy position. False once the next event is below its trigger,
   * where the contract would revert the reorder.
   */
  suggestReorder: boolean;
}

/**
 * Primary warning order, highest first. Without WBTC debt, dust suppresses
 * all warnings except urgent. WBTC debt can accompany weird-params.
 */
const PRIMARY_ORDER: WarningType[] = [
  "urgent",
  "wbtc-debt",
  "weird-params",
  "cliff",
  "too-many-vaults",
  "reorder",
];

/** Map calculator warnings to the banner state. */
export function deriveBannerState(result: CalculatorResult): BannerState {
  const { warnings, groups } = result;
  const suggestReorder =
    result.optimalVaultOrder != null && !isFirstEventGapped(groups);

  // Small positions keep urgent warnings and the WBTC notice.
  if (
    warnings.some((w) => w.type === "dust") &&
    !warnings.some((w) => w.type === "wbtc-debt")
  ) {
    const urgentWarning = warnings.find((w) => w.type === "urgent");
    return {
      severity: urgentWarning ? "red" : "hidden",
      primaryWarning: urgentWarning ?? null,
      secondaryWarnings: [],
      suggestReorder: false,
    };
  }

  // Pick the highest-precedence warning as primary; the rest become secondary.
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
