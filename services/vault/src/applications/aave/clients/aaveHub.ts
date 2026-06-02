/** Vault-side wrapper that injects `ethClient` into the SDK Hub reads. */

import {
  getReservesDrawnRatesSafe as sdkGetReservesDrawnRatesSafe,
  type ReserveDrawnRate,
  type ReserveHubAsset,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { ethClient } from "../../../clients/eth-contract/client";

export async function getReservesDrawnRatesSafe(
  reserves: ReserveHubAsset[],
): Promise<ReserveDrawnRate[]> {
  return sdkGetReservesDrawnRatesSafe(ethClient.getPublicClient(), reserves);
}

export type { ReserveDrawnRate, ReserveHubAsset };
