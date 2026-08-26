/**
 * Aave Adapter Position Proxy Client - Read operations
 *
 * Vault-side wrapper that injects ethClient into the SDK reader. Reads the
 * POSITION's fee-inclusive total debt from the depositor's own proxy — not
 * the Spoke's same-signature reserve-wide `getReserveTotalDebt`.
 */

import { getPositionReserveTotalDebt as sdkGetPositionReserveTotalDebt } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "../../../clients/eth-contract/client";

/**
 * Fee-inclusive total debt of the position held by `proxyContract` for
 * `reserveId` — the value the adapter resolves the repay-all sentinel to.
 */
export async function getPositionReserveTotalDebt(
  proxyContract: Address,
  reserveId: bigint,
): Promise<bigint> {
  return sdkGetPositionReserveTotalDebt(
    ethClient.getPublicClient(),
    proxyContract,
    reserveId,
  );
}
