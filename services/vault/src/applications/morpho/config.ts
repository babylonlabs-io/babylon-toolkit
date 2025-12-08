import type { Address } from "viem";

import { ENV } from "../../config/env";

export const MORPHO_APP_ID = "morpho";

export const MORPHO_CONTRACTS = {
  MORPHO_CONTROLLER: ENV.MORPHO_CONTROLLER as Address,
  MORPHO: ENV.MORPHO as Address,
} as const;

export function getMorphoControllerAddress(): Address {
  return MORPHO_CONTRACTS.MORPHO_CONTROLLER;
}
