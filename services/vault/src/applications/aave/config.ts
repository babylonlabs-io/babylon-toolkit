import type { Address } from "viem";

export const AAVE_APP_ID = "aave";

// Aave contract addresses - using placeholder until real addresses are configured
export const AAVE_CONTRACTS = {
  AAVE_CONTROLLER: (process.env.NEXT_PUBLIC_TBV_AAVE_CONTROLLER ||
    "0x0000000000000000000000000000000000000000") as Address,
  AAVE_POOL: (process.env.NEXT_PUBLIC_TBV_AAVE_POOL ||
    "0x0000000000000000000000000000000000000000") as Address,
} as const;

export function getAaveControllerAddress(): Address {
  return AAVE_CONTRACTS.AAVE_CONTROLLER;
}
