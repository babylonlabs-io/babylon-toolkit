import type { Address } from "viem";

import { ENV } from "../../config/env";

// Re-export SDK function names
export { AAVE_FUNCTION_NAMES } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export const AAVE_APP_ID = "aave";

export const AAVE_CONTRACTS = {
  AAVE_ADAPTER: ENV.AAVE_ADAPTER as Address,
} as const;

export function getAaveAdapterAddress(): Address {
  return AAVE_CONTRACTS.AAVE_ADAPTER;
}
