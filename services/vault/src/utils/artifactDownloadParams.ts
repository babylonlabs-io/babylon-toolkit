import { isHex, type Hex } from "viem";

import {
  getSignedGraphFingerprint,
  PendingPeginStorageReadError,
} from "@/storage/peginStorage";
import type { CollateralVaultEntry } from "@/types/collateral";

/** What a vault-provider artifact download needs. */
export interface ArtifactDownloadParams {
  vaultId: Hex;
  providerAddress: string;
  peginTxid: string;
  depositorPk: string;
  unsignedPrePeginTxHex: string;
}

/**
 * True when this device holds the presign fingerprint the download checks the
 * bundle against. Unreadable storage counts as none: without the fingerprint
 * the download is refused anyway.
 */
function hasSignedGraphFingerprint(ethAddress: string, vaultId: Hex): boolean {
  try {
    return getSignedGraphFingerprint(ethAddress, vaultId).status === "found";
  } catch (err) {
    if (err instanceof PendingPeginStorageReadError) return false;
    throw err;
  }
}

/**
 * The download inputs of a real vault entry, or null when the entry cannot be
 * downloaded: a demo row (it carries a fake `vaultId` and no provider), one
 * missing the peg-in hash or depositor key the provider call is bound to, one
 * missing the unsigned Pre-PegIn tx that re-derives the provider auth anchor
 * after a reload, or one this device holds no presign fingerprint for.
 */
export function getArtifactDownloadParams(
  vault: CollateralVaultEntry,
  ethAddress: string | undefined,
): ArtifactDownloadParams | null {
  if (
    vault.displayOnly ||
    !vault.depositorBtcPubkey ||
    !vault.peginTxHash ||
    !vault.unsignedPrePeginTx ||
    !isHex(vault.vaultId) ||
    !ethAddress ||
    !hasSignedGraphFingerprint(ethAddress, vault.vaultId)
  ) {
    return null;
  }
  return {
    vaultId: vault.vaultId,
    providerAddress: vault.providerAddress,
    peginTxid: vault.peginTxHash,
    depositorPk: vault.depositorBtcPubkey,
    unsignedPrePeginTxHex: vault.unsignedPrePeginTx,
  };
}
