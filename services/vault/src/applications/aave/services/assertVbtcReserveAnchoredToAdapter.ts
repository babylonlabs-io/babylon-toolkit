/**
 * Pre-sign anchor: prove the displayed vBTC reserve id matches the trusted
 * adapter's `BTC_VAULT_CORE_VAULT_BTC_RESERVE_ID`, and that the on-chain
 * reserve at that id has `underlying === VAULT_BTC`.
 *
 * Defends against a tampered indexer pointing the UI at a different reserve
 * (auditor finding #230). The CF-staleness gate (`assertCfUnchanged`,
 * auditor finding #260) sits next to this in the borrow / repay pre-sign
 * flow but solves a different problem; the two are complementary, not
 * redundant.
 */

import type { Address } from "viem";

import { getReserve } from "../clients/spoke";
import {
  type AdapterImmutables,
  getAdapterImmutables,
} from "../clients/transaction";

import { ReserveMismatchError } from "./assertReserveMatchesOnChain";

/**
 * Memoize the adapter's immutables — `BTC_VAULT_CORE_SPOKE`,
 * `BTC_VAULT_CORE_VAULT_BTC_RESERVE_ID`, `VAULT_BTC` are all Solidity
 * `immutable`, so the multicall result is safe to cache for the lifetime
 * of the page. A failed read clears the cache so we retry on the next
 * call rather than poisoning every subsequent borrow.
 */
const adapterImmutablesCache = new Map<Address, Promise<AdapterImmutables>>();

function getCachedAdapterImmutables(
  adapterAddress: Address,
): Promise<AdapterImmutables> {
  const cached = adapterImmutablesCache.get(adapterAddress);
  if (cached) return cached;
  const pending = getAdapterImmutables(adapterAddress).catch((err) => {
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
 * @param trustedAdapterAddress - Env-pinned Aave adapter (the same address
 *   the borrow/repay tx is sent to).
 * @param displayedVbtcReserveId - The reserve id the UI currently believes
 *   is vBTC (came from the GraphQL indexer via `useAaveConfig`).
 * @throws {ReserveMismatchError} if the displayed reserve id doesn't match
 *   the adapter's immutable, or if the spoke's reserve at that id has a
 *   different underlying than the adapter's `VAULT_BTC`.
 */
export async function assertVbtcReserveAnchoredToAdapter(
  trustedAdapterAddress: Address,
  displayedVbtcReserveId: bigint,
): Promise<void> {
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
}
