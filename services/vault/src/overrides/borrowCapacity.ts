import {
  getHealthFactorStatusFromValue,
  type HealthFactorStatus,
} from "@/applications/aave/utils";

import { createOverrideStore } from "./store";

/** What the Loans summary should render for a forced borrow-capacity state. */
export interface BorrowCapacityOverride {
  loading: boolean;
  error: Error | null;
}

const healthFactorOverrideStore = createOverrideStore<number>();
const borrowCapacityOverrideStore =
  createOverrideStore<BorrowCapacityOverride>();

/** Force (a value) or release (null) the Loans summary health factor. */
export const useHealthFactorOverride = healthFactorOverrideStore.useValue;
export const setHealthFactorOverride = healthFactorOverrideStore.set;

/** Force (loading / error) or release (null) the borrow-capacity cards. */
export const useBorrowCapacityOverride = borrowCapacityOverrideStore.useValue;
export const setBorrowCapacityOverride = borrowCapacityOverrideStore.set;

/**
 * What a page should render for the health factor given a forced value. Shared
 * by every god-mode consumer so they can't drift on how a forced value maps to
 * a status: the status is always re-derived with the production banding
 * function, never carried over from the live read.
 */
export function resolveShownHealthFactor(
  override: number | null,
  healthFactor: number | null,
  healthFactorStatus: HealthFactorStatus,
): { healthFactor: number | null; healthFactorStatus: HealthFactorStatus } {
  if (override === null) return { healthFactor, healthFactorStatus };
  return {
    healthFactor: override,
    healthFactorStatus: getHealthFactorStatusFromValue(override),
  };
}
