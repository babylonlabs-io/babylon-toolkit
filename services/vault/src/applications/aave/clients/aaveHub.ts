/** Vault-side wrapper that injects `ethClient` into the SDK Hub reads. */

import {
  getAssetDrawnRatesSafe as sdkGetAssetDrawnRatesSafe,
  type AssetDrawnRateRequest,
  type AssetDrawnRateResult,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";

import { ethClient } from "../../../clients/eth-contract/client";

export async function getAssetDrawnRatesSafe(
  requests: AssetDrawnRateRequest[],
): Promise<AssetDrawnRateResult[]> {
  return sdkGetAssetDrawnRatesSafe(ethClient.getPublicClient(), requests);
}

export type { AssetDrawnRateRequest, AssetDrawnRateResult };
