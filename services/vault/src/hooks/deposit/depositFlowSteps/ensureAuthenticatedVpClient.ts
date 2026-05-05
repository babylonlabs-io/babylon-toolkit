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
import { calculateBtcTxHash } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import type { Address, Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

export interface EnsureAuthenticatedVpClientParams {
  btcWallet: BitcoinWallet;
  /**
   * On-chain vault id. Used on the cold path to fetch `prePeginTxHash`
   * and validate `unsignedPrePeginTxHex` before the wallet's
   * `deriveContextHash` is invoked over its funding outpoints.
   */
  vaultId: Hex;
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

  // Cold path only: validate the indexer-supplied Pre-PegIn tx against
  // the on-chain `prePeginTxHash` BEFORE invoking the wallet's
  // `deriveContextHash`. Without this, a compromised indexer can ask
  // the wallet to derive over attacker-chosen funding outpoints. Lives
  // here (not at every caller) so every cold-path entry — payout
  // signing on cross-device resume, WOTS submit on cache miss, future
  // callers — fails closed by default. The cache-hit short-circuit
  // above keeps the same-device hot path free of any extra read.
  const reader = getVaultRegistryReader();
  const protocol = await reader.getVaultProtocolInfo(params.vaultId);
  const computedTxHash = calculateBtcTxHash(params.unsignedPrePeginTxHex);
  if (computedTxHash.toLowerCase() !== protocol.prePeginTxHash.toLowerCase()) {
    throw new Error(
      `Pre-PegIn transaction hash mismatch: computed ${computedTxHash} from indexer tx, ` +
        `but on-chain contract has ${protocol.prePeginTxHash}. ` +
        `Aborting to prevent potential attack.`,
    );
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

  const pinnedServerPubkey = await reader.getVaultProviderBtcPubKey(
    params.providerAddress as Address,
  );

  return createAuthenticatedVpClient({
    baseUrl,
    peginTxid,
    authAnchorHex,
    pinnedServerPubkey,
  });
}
