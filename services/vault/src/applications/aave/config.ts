import type { Address } from "viem";

import { ENV } from "../../config/env";

export const AAVE_APP_ID = "aave";

export const AAVE_CONTRACTS = {
  AAVE_CONTROLLER: ENV.AAVE_CONTROLLER as Address,
} as const;

export function getAaveControllerAddress(): Address {
  return AAVE_CONTRACTS.AAVE_CONTROLLER;
}
