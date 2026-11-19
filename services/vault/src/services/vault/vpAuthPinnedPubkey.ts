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
  /** JSON-RPC bootstrap issuer: the operation key frozen into this vault. */
  pinnedServerPubkey: OnChainBtcPubkey;
  /** gRPC bootstrap issuer: the same frozen key. */
  grpcPinnedServerPubkey: OnChainBtcPubkey;
  /** Epoch that selected both pins. */
  grpcKeyEpoch: bigint;
}

/**
 * Resolve the token-subject pins for an existing vault.
 *
 * Throws when `vpAddress` is not the on-chain provider of `vaultId`. Call it
 * before the auth anchor can leave the browser.
 *
 * The provider issues every depositor token under the VP identity frozen
 * into the peg-in (btc-vault #2984), so both subjects pin the operation key
 * at the vault's VP epoch and never follow a later rotation.
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
  const frozenKey = await reader.getVaultProviderOperationBtcKeyAtEpoch(
    vpAddress,
    epochs.vpKeyEpoch,
  );
  return {
    pinnedServerPubkey: frozenKey,
    grpcPinnedServerPubkey: frozenKey,
    grpcKeyEpoch: epochs.vpKeyEpoch,
  };
}
