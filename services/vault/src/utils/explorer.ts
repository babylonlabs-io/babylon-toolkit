/**
 * Block explorer URL helpers.
 *
 * BTC:  https://mempool.space/<network>/tx/<txid>      (hash without 0x)
 * ETH:  <chain explorer>/tx/<hash>                      (hash with 0x)
 */

import { getNetworkConfigETH } from "@babylonlabs-io/config";

import { getNetworkConfigBTC } from "@/config";
import type { ActivityChain } from "@/types/activityLog";
import { stripHexPrefix } from "@/utils/btc";

export function getBtcExplorerTxUrl(txHash: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/tx/${stripHexPrefix(txHash)}`;
}

export function getEthExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

export function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
}
