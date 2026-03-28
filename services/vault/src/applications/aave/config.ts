import type { Address } from "viem";

import { ENV } from "../../config/env";

// Re-export SDK function names
export { AAVE_FUNCTION_NAMES } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

export const AAVE_APP_ID = "aave";

export const AAVE_CONTRACTS = {
  AAVE_CONTROLLER: ENV.AAVE_CONTROLLER as Address,
} as const;

export function getAaveControllerAddress(): Address {
  return AAVE_CONTRACTS.AAVE_CONTROLLER;
}
