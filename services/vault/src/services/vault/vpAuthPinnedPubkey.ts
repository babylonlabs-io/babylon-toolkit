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
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";

export interface ResolvedVpAuthPins {
  /**
   * JSON-RPC bootstrap issuer: the provider's live operation key, or the
   * vault's frozen key when HTTP artifact downloads are on.
   */
  pinnedServerPubkey: OnChainBtcPubkey;
  /** gRPC bootstrap issuer: the operation key frozen into this vault. */
  grpcPinnedServerPubkey: OnChainBtcPubkey;
  /** Epoch that selected `grpcPinnedServerPubkey`. */
  grpcKeyEpoch: bigint;
  /**
   * Re-reads the live JSON-RPC issuer after an identity mismatch. Absent
   * when the JSON-RPC issuer is the frozen key, which must never move.
   */
  refreshJsonRpcPinnedServerPubkey?: () => Promise<OnChainBtcPubkey>;
}

/**
 * Resolve both token-subject pins for an existing vault.
 *
 * Throws when `vpAddress` is not the on-chain provider of `vaultId`. Call it
 * before the auth anchor can leave the browser.
 *
 * `auth_createDepositorTokenGrpc` is issued under the vault's frozen VP epoch.
 * A VP with HTTP artifact downloads also issues `auth_createDepositorToken`
 * under that frozen key; an older VP issues it under its current key. The
 * keys are equal before the first rotation and diverge for a pre-rotation
 * vault afterwards.
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
  const epochs = await reader.getVaultKeyEpochs(vaultId);
  const grpcPinnedServerPubkey =
    await reader.getVaultProviderOperationBtcKeyAtEpoch(
      vpAddress,
      epochs.vpKeyEpoch,
    );
  const pins = { grpcPinnedServerPubkey, grpcKeyEpoch: epochs.vpKeyEpoch };

  if (featureFlags.isHttpArtifactDownloadsEnabled) {
    return { ...pins, pinnedServerPubkey: grpcPinnedServerPubkey };
  }
  const readLiveKey = () =>
    reader.getCurrentVaultProviderOperationBtcKey(vpAddress);
  return {
    ...pins,
    pinnedServerPubkey: await readLiveKey(),
    refreshJsonRpcPinnedServerPubkey: readLiveKey,
  };
}
