/**
 * Aave Integration Adapter Client - Read operations
 *
 * Vault-side wrapper that injects ethClient into SDK adapter reads.
 * Used to fetch on-chain position-size parameters (max BTC per position and
 * the per-position BTC Vault cap).
 */

import {
  getPositionSizeParams as sdkGetPositionSizeParams,
  type PositionSizeParams,
} from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

/**
 * Read the on-chain position-size parameters (max BTC per position and max
 * BTC Vaults per position) from the AaveIntegrationAdapter. Thin DI wrapper
 * over the SDK `getPositionSizeParams`.
 */
export async function getPositionSizeParams(
  adapterAddress: Address,
): Promise<PositionSizeParams> {
  const publicClient = ethClient.getPublicClient();
  return sdkGetPositionSizeParams(publicClient, adapterAddress);
}
