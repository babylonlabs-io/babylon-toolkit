import type { CollateralVaultEntry } from "@/types/collateral";

import { createOverrideStore } from "./store";

export interface CollateralOverride {
  vaults: CollateralVaultEntry[];
  hideReal: boolean;
}

const collateralOverrideStore = createOverrideStore<CollateralOverride>();

export const useCollateralOverride = collateralOverrideStore.useValue;
export const setCollateralOverride = collateralOverrideStore.set;
