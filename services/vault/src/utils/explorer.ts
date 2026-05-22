/**
 * Block explorer URL helpers.
 *
 * BTC:  https://mempool.space/<network>/tx/<txid>      (hash without 0x)
 * ETH:  <chain explorer>/tx/<hash>                      (hash with 0x)
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";

import { getNetworkConfigBTC } from "@/config";
import { getNetworkConfigETH } from "@/config/network";
import type { ActivityChain } from "@/types/activityLog";

export function getBtcExplorerTxUrl(txHash: string): string {
  const btcConfig = getNetworkConfigBTC();
  return `${btcConfig.mempoolApiUrl}/tx/${stripHexPrefix(txHash)}`;
}

function getEthExplorerTxUrl(txHash: string): string {
  const { explorerUrl } = getNetworkConfigETH();
  return `${explorerUrl}/tx/${txHash}`;
}

export function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
}
