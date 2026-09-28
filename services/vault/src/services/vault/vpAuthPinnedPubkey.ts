/** Subject-specific VP authentication pins. */

import type { OnChainBtcPubkey } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import type { Address, Hex } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";

export interface ResolvedVpAuthPins {
  /** JSON-RPC bootstrap issuer: the provider's live operation key. */
  pinnedServerPubkey: OnChainBtcPubkey;
  /** gRPC bootstrap issuer: the operation key frozen into this vault. */
  grpcPinnedServerPubkey: OnChainBtcPubkey;
  /** Epoch that selected `grpcPinnedServerPubkey`. */
  grpcKeyEpoch: bigint;
}

/**
 * Resolve both token-subject pins for an existing vault.
 *
 * `auth_createDepositorToken` proves the provider's current server identity,
 * while `auth_createDepositorTokenGrpc` is issued under the vault's frozen VP
 * epoch. They are equal before the first rotation and intentionally diverge
 * for a pre-rotation vault afterwards.
 */
export async function resolveVpAuthPins(
  vpAddress: Address,
  vaultId: Hex,
): Promise<ResolvedVpAuthPins> {
  const reader = getVaultRegistryReader();
  const [pinnedServerPubkey, epochs] = await Promise.all([
    reader.getCurrentVaultProviderOperationBtcKey(vpAddress),
    reader.getVaultKeyEpochs(vaultId),
  ]);
  const grpcPinnedServerPubkey =
    await reader.getVaultProviderOperationBtcKeyAtEpoch(
      vpAddress,
      epochs.vpKeyEpoch,
    );

  return {
    pinnedServerPubkey,
    grpcPinnedServerPubkey,
    grpcKeyEpoch: epochs.vpKeyEpoch,
  };
}

/** Re-read the live JSON-RPC issuer after a bounded identity-mismatch retry. */
export function refreshVpJsonRpcPinnedPubkey(
  vpAddress: Address,
): Promise<OnChainBtcPubkey> {
  return getVaultRegistryReader().getCurrentVaultProviderOperationBtcKey(
    vpAddress,
  );
}
