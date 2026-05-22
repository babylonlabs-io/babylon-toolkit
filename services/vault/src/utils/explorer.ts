/**
 * Block explorer URL helpers.
 *
 * BTC:  https://mempool.space/<network>/tx/<txid>      (hash without 0x)
 * ETH:  <chain explorer>/tx/<hash>                      (hash with 0x)
 * ETH:  <chain explorer>/address/<address>             (20-byte address)
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getNetworkConfigBTC } from "@/config";
import { getNetworkConfigETH } from "@/config/network";
import type { ActivityChain } from "@/types/activityLog";

export function getBtcExplorerTxUrl(txHash: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/tx/${stripHexPrefix(txHash)}`;
}

export function getEthExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

/**
 * Explorer URL for an Ethereum address page. Used by the vault provider
 * picker to link each VP (whose `id` is its registered ETH address) so the
 * user can inspect it on-chain.
 */
export function getEthExplorerAddressUrl(address: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/address/${address}`;
}

export function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
}
