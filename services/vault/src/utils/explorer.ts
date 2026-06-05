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
 * VP:  <NEXT_PUBLIC_TBV_VP_EXPLORER_URL>/{provider,vault,depositor}/<id>
 *      Babylon BTC Vault explorer — vault-state pages only; it has NO
 *      per-transaction pages, so BTC/ETH tx hashes stay on mempool/etherscan.
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
 * Build `<explorer base>/<path>/<value>` on the Babylon BTC Vault explorer, or
 * `undefined` when the base is unconfigured (`NEXT_PUBLIC_TBV_VP_EXPLORER_URL`
 * unset) or `value` is empty. Callers MUST treat `undefined` as "no link"
 * rather than rendering a broken or environment-mismatched URL.
 *
 * `value` is lowercased: the explorer keys vault ids and addresses lowercase,
 * and Ethereum addresses are case-insensitive (EIP-55 is display-only), so a
 * checksummed address from the wallet would otherwise 404.
 */
function buildVpExplorerUrl(
  path: "provider" | "vault",
  value: string | undefined,
): string | undefined {
  if (!ENV.VP_EXPLORER_URL || !value) return undefined;
  return `${ENV.VP_EXPLORER_URL}/${path}/${value.toLowerCase()}`;
}

/**
 * Provider page — `id` is the VP's registered ETH address. Used by the VP
 * picker (and the vault card's "secured by") so the depositor can inspect it.
 */
export function getVpExplorerProviderUrl(
  address: string | undefined,
): string | undefined {
  return buildVpExplorerUrl("provider", address);
}

/**
 * Vault page — `vaultId` is `keccak256(abi.encode(peginTxHash, depositor))`,
 * the canonical on-chain id the app already holds. Only resolves once the vault
 * is indexed (active); gate the link on lifecycle state at the call site.
 */
export function getVpExplorerVaultUrl(
  vaultId: string | undefined,
): string | undefined {
  return buildVpExplorerUrl("vault", vaultId);
}

/** Explorer home/landing. `undefined` when the base URL is unconfigured. */
export function getVpExplorerHomeUrl(): string | undefined {
  return ENV.VP_EXPLORER_URL || undefined;
}

export function getExplorerTxUrl(chain: ActivityChain, txHash: string): string {
  return chain === "BTC"
    ? getBtcExplorerTxUrl(txHash)
    : getEthExplorerTxUrl(txHash);
}
