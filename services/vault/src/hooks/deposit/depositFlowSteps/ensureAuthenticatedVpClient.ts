/**
 * Vault-side glue: derive `authAnchorHex` from the wallet (popup) and
 * `pinnedServerPubkey` from chain, then build an authenticated VP RPC
 * client. Reuses the registry cache if an entry for this `peginTxid`
 * already exists — preventing a second wallet popup for sites that
 * run after `primeVpTokenRegistry` (e.g. WOTS submit + payout signing
 * within the same deposit flow).
 *
 * The SDK's auth API is value-only and has no notion of "wallet";
 * this helper is the wallet-coupled glue that lives in the FE.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  deriveVaultRoot,
  expandAuthAnchor,
  hexToUint8Array,
  parseFundingOutpointsFromTx,
  uint8ArrayToHex,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  createAuthenticatedVpClient,
  VaultProviderRpcClient,
  vpTokenRegistry,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

export interface EnsureAuthenticatedVpClientParams {
  btcWallet: BitcoinWallet;
  unsignedPrePeginTxHex: string;
  peginTxHash: string;
  providerAddress: string;
  depositorBtcPubkey: string;
}

export async function ensureAuthenticatedVpClient(
  params: EnsureAuthenticatedVpClientParams,
): Promise<VaultProviderRpcClient> {
  const peginTxid = stripHexPrefix(params.peginTxHash);
  const baseUrl = getVpProxyUrl(params.providerAddress);

  const cached = vpTokenRegistry.peek(peginTxid);
  if (cached) {
    return new VaultProviderRpcClient(baseUrl, { tokenProvider: cached });
  }

  // Cold-start: derive auth anchor from the wallet (popup) and fetch
  // the pinned VP pubkey from chain.
  let root: Uint8Array | null = null;
  let authAnchorHex: string;
  try {
    root = await deriveVaultRoot(params.btcWallet, {
      depositorBtcPubkey: hexToUint8Array(params.depositorBtcPubkey),
      fundingOutpoints: parseFundingOutpointsFromTx(
        params.unsignedPrePeginTxHex,
      ),
    });
    const authAnchorBytes = expandAuthAnchor(root);
    try {
      authAnchorHex = uint8ArrayToHex(authAnchorBytes);
    } finally {
      authAnchorBytes.fill(0);
    }
  } finally {
    root?.fill(0);
  }

  const pinnedServerPubkey =
    await getVaultRegistryReader().getVaultProviderBtcPubKey(
      params.providerAddress as Address,
    );

  return createAuthenticatedVpClient({
    baseUrl,
    peginTxid,
    authAnchorHex,
    pinnedServerPubkey,
  });
}
