/**
 * Assert that an indexer-supplied reserve maps to the expected token on-chain.
 *
 * The borrow/repay flows take `reserveId` and `token.address` from GraphQL and
 * pass them directly to the Aave adapter. A compromised indexer can swap the
 * pair so the user sees one token in the UI but signs a tx against a different
 * one (e.g. user thinks USDC, contract executes against WBTC). This guard
 * resolves the reserve on-chain and fails closed if `underlying` doesn't match.
 *
 * Resolves the Core Spoke from the env-pinned adapter the tx path uses
 * (NOT the indexer-supplied `aaveConfig.coreSpokeAddress`). Otherwise an
 * attacker-controlled adapter+spoke pair could craft a matching
 * `reserveId -> underlying` mapping that passes the check while the real
 * tx executes against the env-pinned adapter where the same id may mean a
 * different asset.
 */

import type { Address } from "viem";

import { getReserve } from "../clients/spoke";
import { getCoreSpokeAddress } from "../clients/transaction";

export class ReserveMismatchError extends Error {
  readonly code = "RESERVE_MISMATCH";
}

/**
 * Memoize `BTC_VAULT_CORE_SPOKE` per adapter — it's an `immutable` property of
 * the adapter contract, so re-reading it on every borrow/repay is wasted work.
 * Cache the in-flight promise so concurrent calls dedupe to a single RPC.
 */
const coreSpokeCache = new Map<Address, Promise<Address>>();

function getCachedCoreSpokeAddress(adapterAddress: Address): Promise<Address> {
  const cached = coreSpokeCache.get(adapterAddress);
  if (cached) return cached;
  const pending = getCoreSpokeAddress(adapterAddress).catch((err) => {
    // Don't poison the cache on transient failures.
    coreSpokeCache.delete(adapterAddress);
    throw err;
  });
  coreSpokeCache.set(adapterAddress, pending);
  return pending;
}

/** Test-only: clear the per-adapter spoke-address memoization between tests. */
export function _resetCoreSpokeCacheForTests(): void {
  coreSpokeCache.clear();
}

/**
 * @param trustedAdapterAddress - Env-pinned Aave adapter (the same address
 *   the borrow/repay tx is sent to). The spoke is read from this adapter's
 *   immutable `BTC_VAULT_CORE_SPOKE` property.
 * @throws {ReserveMismatchError} when on-chain `underlying` doesn't match.
 */
export async function assertReserveMatchesOnChain(
  trustedAdapterAddress: Address,
  reserveId: bigint,
  expectedTokenAddress: Address,
): Promise<void> {
  const spokeAddress = await getCachedCoreSpokeAddress(trustedAdapterAddress);
  const onChain = await getReserve(spokeAddress, reserveId);
  if (onChain.underlying.toLowerCase() !== expectedTokenAddress.toLowerCase()) {
    throw new ReserveMismatchError(
      `Reserve ${reserveId} resolves to ${onChain.underlying} on-chain, ` +
        `but the indexer mapped it to ${expectedTokenAddress}. Aborting to ` +
        `prevent borrowing or repaying the wrong asset.`,
    );
  }
}
