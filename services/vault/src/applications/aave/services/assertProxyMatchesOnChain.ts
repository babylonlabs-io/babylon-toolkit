/**
 * Assert that an indexer-supplied proxy contract matches the user's on-chain
 * proxy before it is used for any live Aave Spoke read or to size a repayment.
 *
 * The position service and the full-repay path take `proxyContract` from
 * GraphQL and pass it directly to Spoke reads (health factor, account data,
 * debt discovery) and to `getUserTotalDebt` (which sizes the full-repay
 * amount). A compromised indexer can return the victim's real position record
 * but swap `proxyContract` for one with less debt / healthier collateral —
 * corrupting every risk figure and the full-repay amount. Settlement is always
 * against the connected wallet, so funds can't be redirected, but the figures
 * the user signs against can be falsified. This guard resolves the proxy
 * on-chain and fails closed if it disagrees.
 *
 * Resolves the proxy from the env-pinned adapter the tx path uses (via
 * `getAaveAdapterAddress()` at the call site), NOT the indexer-supplied
 * `aaveConfig.coreSpokeAddress` or any indexer-derived address. Otherwise an
 * attacker-controlled adapter could return a matching proxy that passes the
 * check while the real position lives elsewhere.
 */

import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address } from "viem";

import { ethClient } from "@/clients/eth-contract/client";

export class ProxyMismatchError extends Error {
  readonly code = "PROXY_MISMATCH";
}

/**
 * Memoize the on-chain proxy per user — a deployed proxy is stable for a given
 * user, so re-reading it on every position load / repay is wasted work. Cache
 * the in-flight promise so concurrent callers dedupe to a single RPC.
 *
 * Only successful, non-null resolutions are cached: `resolveTrustedProxyContract`
 * throws when `getPosition` returns `null` (proxy not yet deployed) or the RPC
 * rejects, and the `.catch` below deletes the entry so the outcome is never
 * cached. A legitimately just-deployed proxy is therefore not masked by a
 * stale "no position" result.
 */
const proxyCache = new Map<Address, Promise<Address>>();

/**
 * Resolve the user's authoritative proxy contract from the env-pinned adapter.
 *
 * @param trustedAdapterAddress - Env-pinned Aave adapter (same address the
 *   tx is sent to).
 * @param user - User's Ethereum address.
 * @throws {ProxyMismatchError} when no on-chain position exists (proxy not yet
 *   deployed) — fail closed rather than trust the indexer value.
 */
export async function resolveTrustedProxyContract(
  trustedAdapterAddress: Address,
  user: Address,
): Promise<Address> {
  const cached = proxyCache.get(user);
  if (cached) return cached;

  const pending = getPosition(
    ethClient.getPublicClient(),
    trustedAdapterAddress,
    user,
  )
    .then((position) => {
      if (!position) {
        throw new ProxyMismatchError(
          `No on-chain position found for ${user} on adapter ${trustedAdapterAddress}. ` +
            `The indexer reports a position but the proxy is not deployed on-chain. ` +
            `Aborting to avoid computing against an unverified proxy.`,
        );
      }
      return position.proxyContract;
    })
    .catch((err) => {
      // Never poison the cache: a transient RPC failure or a not-yet-deployed
      // proxy must be retried on the next call, not served from cache.
      proxyCache.delete(user);
      throw err;
    });

  proxyCache.set(user, pending);
  return pending;
}

/** Test-only: clear the per-user proxy memoization between tests. */
export function _resetProxyCacheForTests(): void {
  proxyCache.clear();
}

/**
 * Verify the indexer-supplied proxy matches the on-chain proxy, returning the
 * trusted (on-chain) address for downstream use.
 *
 * @param trustedAdapterAddress - Env-pinned Aave adapter. Read straight from
 *   `getAaveAdapterAddress()` at the call site.
 * @param user - User's Ethereum address.
 * @param indexerProxy - Proxy contract as supplied by the indexer/GraphQL.
 * @returns The on-chain proxy address (use this, not `indexerProxy`).
 * @throws {ProxyMismatchError} when the on-chain proxy disagrees with the
 *   indexer value (case-insensitive), or when no on-chain position exists.
 */
export async function assertProxyMatchesOnChain(
  trustedAdapterAddress: Address,
  user: Address,
  indexerProxy: Address,
): Promise<Address> {
  const onChainProxy = await resolveTrustedProxyContract(
    trustedAdapterAddress,
    user,
  );
  if (onChainProxy.toLowerCase() !== indexerProxy.toLowerCase()) {
    throw new ProxyMismatchError(
      `Proxy contract for ${user} resolves to ${onChainProxy} on-chain, ` +
        `but the indexer supplied ${indexerProxy}. Aborting to prevent ` +
        `computing risk figures or a repayment amount against a spoofed proxy.`,
    );
  }
  return onChainProxy;
}
