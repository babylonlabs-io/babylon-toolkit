import { COPY } from "@/copy";

import type { LiquidationTourPlacement } from "./liquidationTourPlacement";

type LiquidationTourStepKey = keyof typeof COPY.liquidations.tour.steps;

/**
 * DOM ids of the sections the tour spotlights, one per step copy entry. The
 * Playwright specs select the same ids.
 */
export const LIQUIDATION_TOUR_TARGET_IDS = {
  position: "liquidation-tour-position",
  health: "liquidation-tour-health",
  simulation: "liquidation-tour-simulation",
  events: "liquidation-tour-events",
  outcomes: "liquidation-tour-outcomes",
} as const satisfies Record<LiquidationTourStepKey, string>;

export interface LiquidationTourStep {
  key: LiquidationTourStepKey;
  targetId: string;
  placement: LiquidationTourPlacement;
  copy: { title: string; body: string };
}

function tourStep(
  key: LiquidationTourStepKey,
  placement: LiquidationTourPlacement,
): LiquidationTourStep {
  return {
    key,
    targetId: LIQUIDATION_TOUR_TARGET_IDS[key],
    placement,
    copy: COPY.liquidations.tour.steps[key],
  };
}

/** The tour's steps, in order. */
export const LIQUIDATION_TOUR_STEPS: readonly LiquidationTourStep[] = [
  tourStep("position", "below"),
  tourStep("health", "below"),
  tourStep("simulation", "above"),
  tourStep("events", "above"),
  tourStep("outcomes", "above"),
];
