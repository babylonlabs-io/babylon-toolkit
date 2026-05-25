/**
 * Block explorer URL helpers.
 *
 * BTC:  https://mempool.space/<network>/tx/<txid>      (hash without 0x)
 * ETH:  <chain explorer>/tx/<hash>                      (hash with 0x)
 * VP:   <NEXT_PUBLIC_TBV_VP_EXPLORER_URL>/provider/<address>
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getNetworkConfigBTC } from "@/config";
import { ENV } from "@/config/env";
import { getNetworkConfigETH } from "@/config/network";
import type { ActivityChain } from "@/types/activityLog";

export function getBtcExplorerTxUrl(txHash: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/tx/${stripHexPrefix(txHash)}`;
}

export function getBtcExplorerAddressUrl(address: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/address/${address}`;
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
