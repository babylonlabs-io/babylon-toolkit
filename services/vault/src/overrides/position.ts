import type { PositionNotificationsStatus } from "@/applications/aave/hooks/usePositionNotifications";
import type {
  CalculatorParams,
  CalculatorResult,
} from "@/applications/aave/positionNotifications";

import { createOverrideStore } from "./store";

/** The already-resolved manual-mode cascade: whether this override is
 *  "active" is decided once at publish time (null = not active), never
 *  re-derived per consumer.
 *
 *  `result` is null when the panel is simulating a STATUS rather than a
 *  cascade (stale price): the banner takes the status, but there is no
 *  simulated cascade to chart, so a consumer that charts the cascade must
 *  treat a null result as "no cascade" and fall back to live. */
export interface PositionCascadeOverride {
  result: CalculatorResult | null;
  status: PositionNotificationsStatus | null;
  params: CalculatorParams;
}

const positionCascadeOverrideStore =
  createOverrideStore<PositionCascadeOverride>();

export const usePositionCascadeOverride = positionCascadeOverrideStore.useValue;
export const setPositionCascadeOverride = positionCascadeOverrideStore.set;
