/**
 * Subject-specific VP authentication pins.
 *
 * The pins alone do not stop a wrong provider. The keys are read for the
 * address the caller gives, and the auth anchor goes to the endpoint named by
 * that same address. So the address must first match the vault's on-chain
 * provider, or the anchor goes to a party that can mint depositor tokens.
 */

import type { OnChainBtcPubkey } from "@babylonlabs-io/ts-sdk/tbv/core/clients";
import { type Address, type Hex, isAddressEqual } from "viem";

import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";
import { COPY } from "@/copy";

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
 * Throws when `vpAddress` is not the on-chain provider of `vaultId`. Call it
 * before the auth anchor can leave the browser.
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
  const { vaultProvider } = await reader.getVaultBasicInfo(vaultId);
  if (!isAddressEqual(vaultProvider, vpAddress)) {
    throw new Error(
      COPY.deposit.errors.vaultProviderMismatch(
        vaultId,
        vpAddress,
        vaultProvider,
      ),
    );
  }
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
