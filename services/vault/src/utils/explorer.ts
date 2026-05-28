/**
 * Block explorer URL helpers.
 *
 * BTC: always built against the canonical public explorer host
 *      (`https://mempool.space/<network>`). The mempool *API* URL
 *      (`NEXT_PUBLIC_MEMPOOL_API`) can point at a self-hosted mirror used
 *      for UTXO / fee / broadcast calls; user-facing links must not depend
 *      on whether that mirror is reachable, so they stay on the public
 *      explorer.
 * ETH: <chain explorer>/tx/<hash>                        (hash with 0x)
 * VP:  <NEXT_PUBLIC_TBV_VP_EXPLORER_URL>/provider/<addr>
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getBTCNetwork } from "@/config";
import { ENV } from "@/config/env";
import { getNetworkConfigETH } from "@/config/network";
import type { ActivityChain } from "@/types/activityLog";

const MEMPOOL_SPACE_HOST = "https://mempool.space";
const BTC_SIGNET_NETWORK = "signet";

function getBtcExplorerHost(): string {
  return getBTCNetwork() === BTC_SIGNET_NETWORK
    ? `${MEMPOOL_SPACE_HOST}/signet`
    : MEMPOOL_SPACE_HOST;
}

export function getBtcExplorerTxUrl(txHash: string): string {
  return `${getBtcExplorerHost()}/tx/${stripHexPrefix(txHash)}`;
}

export function getBtcExplorerAddressUrl(address: string): string {
  return `${getBtcExplorerHost()}/address/${address}`;
}

function getEthExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

/**
 * Explorer URL for a vault-provider page on the Babylon BTC Vault explorer.
 * Used by the VP picker to link each VP (whose `id` is its registered ETH
 * address) so the depositor can inspect it. The base URL comes from
 * `NEXT_PUBLIC_TBV_VP_EXPLORER_URL` so the explorer host can be swapped
 * per deployment (testnet vs mainnet) without code changes.
 *
 * Returns `undefined` when the env var is unset — callers MUST treat that
 * as "no link" rather than rendering a broken or environment-mismatched URL.
 */
export function getVpExplorerProviderUrl(address: string): string | undefined {
  if (!ENV.VP_EXPLORER_URL) return undefined;
  return `${ENV.VP_EXPLORER_URL}/provider/${address}`;
}

export function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
}
