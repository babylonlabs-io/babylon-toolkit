import type { Address } from "viem";

import { ENV } from "../../config/env";

export const AAVE_APP_ID = "aave";

const AAVE_CONTRACTS = {
  AAVE_ADAPTER: ENV.AAVE_ADAPTER as Address,
} as const;

export function getAaveAdapterAddress(): Address {
  return AAVE_CONTRACTS.AAVE_ADAPTER;
}
