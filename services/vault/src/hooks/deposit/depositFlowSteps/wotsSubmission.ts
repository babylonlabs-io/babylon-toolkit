/**
 * Step 2.5: WOTS public key RPC submission — adapter over SDK.
 */

import { submitWotsPublicKey as sdkSubmitWotsPublicKey } from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { stripHexPrefix } from "@/utils/btc";

import { ensureAuthenticatedVpClient } from "./ensureAuthenticatedVpClient";
import type { WotsSubmissionParams } from "./types";

/**
 * Submit pre-derived WOTS block public keys to the vault provider via RPC.
 *
 * Polls `getPeginStatus` first to ensure the VP has ingested the pegin and
 * is ready to accept the WOTS key (status = `PendingDepositorWotsPK`).
 * If the VP has already moved past that status, submission is skipped.
 */
export async function submitWotsPublicKey(
  params: WotsSubmissionParams,
): Promise<void> {
  const {
    vaultId,
    peginTxHash,
    depositorBtcPubkey,
    providerAddress,
    wotsPublicKeys,
    btcWallet,
    unsignedPrePeginTxHex,
    signal,
  } = params;

  const peginTxid = stripHexPrefix(peginTxHash);
  const rpcClient = await ensureAuthenticatedVpClient({
    btcWallet,
    vaultId,
    unsignedPrePeginTxHex,
    peginTxHash,
    providerAddress,
    depositorBtcPubkey,
  });

  await sdkSubmitWotsPublicKey({
    statusReader: rpcClient,
    wotsSubmitter: rpcClient,
    peginTxid,
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    wotsPublicKeys,
    signal,
  });
}
