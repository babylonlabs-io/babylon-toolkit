/**
 * Fetch the fresh vBTC collateral factor (CF) at sign time, anchored to the
 * adapter's on-chain immutables — defending the projected-HF check from a
 * tampered indexer. Mirrors the dynamicConfigKey selection used by
 * `useVaultSplitParams` so the CF matches what Aave will actually use.
 */

import type { Address } from "viem";

import { getDynamicReserveConfig, getReserve } from "../clients/spoke";
import {
  type AdapterImmutables,
  getAdapterImmutables,
} from "../clients/transaction";

import { ReserveMismatchError } from "./assertReserveMatchesOnChain";

const adapterImmutablesCache = new Map<Address, Promise<AdapterImmutables>>();

function getCachedAdapterImmutables(
  adapterAddress: Address,
): Promise<AdapterImmutables> {
  const cached = adapterImmutablesCache.get(adapterAddress);
  if (cached) return cached;
  const pending = getAdapterImmutables(adapterAddress).catch((err) => {
    // Don't poison the cache on transient failures.
    adapterImmutablesCache.delete(adapterAddress);
    throw err;
  });
  adapterImmutablesCache.set(adapterAddress, pending);
  return pending;
}

/** Test-only: clear the per-adapter immutables memoization between tests. */
export function _resetAdapterImmutablesCacheForTests(): void {
  adapterImmutablesCache.clear();
}

/**
 * Pass the user's `position.dynamicConfigKey` when one exists — that's the
 * key Aave actually uses for their liquidation math. Omit on first borrow.
 *
 * @throws {ReserveMismatchError} when the displayed reserve id or its
 *   on-chain underlying disagree with the adapter's immutables.
 */
export async function fetchFreshCollateralFactorOnChain(
  trustedAdapterAddress: Address,
  displayedVbtcReserveId: bigint,
  positionDynamicConfigKey?: number,
): Promise<{ collateralFactor: number }> {
  const { spoke, vbtcReserveId, vaultBtc } = await getCachedAdapterImmutables(
    trustedAdapterAddress,
  );

  if (vbtcReserveId !== displayedVbtcReserveId) {
    throw new ReserveMismatchError(
      `vBTC reserve id mismatch: UI ${displayedVbtcReserveId}, adapter ${trustedAdapterAddress} reports ${vbtcReserveId}.`,
    );
  }

  const reserve = await getReserve(spoke, vbtcReserveId);
  if (reserve.underlying.toLowerCase() !== vaultBtc.toLowerCase()) {
    throw new ReserveMismatchError(
      `vBTC reserve underlying mismatch: spoke ${spoke} reserve ${vbtcReserveId} underlying ${reserve.underlying}, expected ${vaultBtc}.`,
    );
  }

  // Prefer the position's stored dynamicConfigKey — that's what Aave uses
  // for an existing user's liquidation math. Fall back to the reserve's
  // current key for first-borrow flows (no position yet).
  const dynamicConfigKey = positionDynamicConfigKey ?? reserve.dynamicConfigKey;

  const config = await getDynamicReserveConfig(
    spoke,
    vbtcReserveId,
    dynamicConfigKey,
  );

  return { collateralFactor: Number(config.collateralFactor) };
}
