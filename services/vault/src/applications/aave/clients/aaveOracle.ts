/** Vault-side wrapper that injects `ethClient` into the SDK oracle reads. */

import {
  getOracleAddress as sdkGetOracleAddress,
  getReservesPrices as sdkGetReservesPrices,
  getReservesPricesSafe as sdkGetReservesPricesSafe,
  type ReservePriceResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

export async function getOracleAddress(
  spokeAddress: Address,
): Promise<Address> {
  return sdkGetOracleAddress(ethClient.getPublicClient(), spokeAddress);
}

export async function getReservesPrices(
  oracleAddress: Address,
  reserveIds: bigint[],
): Promise<bigint[]> {
  return sdkGetReservesPrices(
    ethClient.getPublicClient(),
    oracleAddress,
    reserveIds,
  );
}

export async function getReservesPricesSafe(
  oracleAddress: Address,
  reserveIds: bigint[],
): Promise<ReservePriceResult[]> {
  return sdkGetReservesPricesSafe(
    ethClient.getPublicClient(),
    oracleAddress,
    reserveIds,
  );
}

export type { ReservePriceResult };
