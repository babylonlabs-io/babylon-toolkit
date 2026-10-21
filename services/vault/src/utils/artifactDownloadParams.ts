import { isHex, type Hex } from "viem";

import featureFlags from "@/config/featureFlags";
import { ContractStatus } from "@/models/peginStateMachine";
import {
  getSignedGraphFingerprint,
  PendingPeginStorageReadError,
} from "@/storage/peginStorage";
import type { VaultActivity } from "@/types/activity";
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

/** The vault fields a download is bound to, whichever list the vault is in. */
interface DownloadSource {
  vaultId: string;
  providerAddress?: string;
  peginTxHash?: string;
  depositorBtcPubkey?: string;
  unsignedPrePeginTx?: string;
}

function toDownloadParams(
  source: DownloadSource,
  ethAddress: string | undefined,
): ArtifactDownloadParams | null {
  if (
    !source.providerAddress ||
    !source.depositorBtcPubkey ||
    !source.peginTxHash ||
    !source.unsignedPrePeginTx ||
    !isHex(source.vaultId) ||
    !ethAddress ||
    !hasSignedGraphFingerprint(ethAddress, source.vaultId)
  ) {
    return null;
  }
  return {
    vaultId: source.vaultId,
    providerAddress: source.providerAddress,
    peginTxid: source.peginTxHash,
    depositorPk: source.depositorBtcPubkey,
    unsignedPrePeginTxHex: source.unsignedPrePeginTx,
  };
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
  if (vault.displayOnly) return null;
  return toDownloadParams(vault, ethAddress);
}

/**
 * The download inputs of a vault that expired after Verified, or null. Only an
 * activation-timeout expiry got past Verified, and the provider serves its
 * package while the vault is Expired or, after `claimExpiredVault`, Redeemed
 * (btc-vault #3042, `retains_depositor_artifacts`). That provider serves
 * artifacts over HTTP only, so the download is offered only on that route.
 */
export function getExpiredArtifactDownloadParams(
  activity: VaultActivity,
  ethAddress: string | undefined,
): ArtifactDownloadParams | null {
  if (!featureFlags.isHttpArtifactDownloadsEnabled) return null;
  if (activity.expirationReason !== "activation_timeout") return null;
  if (
    activity.contractStatus !== ContractStatus.EXPIRED &&
    activity.contractStatus !== ContractStatus.REDEEMED
  ) {
    return null;
  }
  return toDownloadParams(
    {
      vaultId: activity.id,
      providerAddress: activity.providers[0]?.id,
      peginTxHash: activity.peginTxHash,
      depositorBtcPubkey: activity.depositorBtcPubkey,
      unsignedPrePeginTx: activity.unsignedPrePeginTx,
    },
    ethAddress,
  );
}
