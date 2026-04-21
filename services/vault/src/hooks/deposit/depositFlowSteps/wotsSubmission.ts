/**
 * Step 2.5: WOTS public key RPC submission — thin adapter over SDK
 *
 * Builds a VaultProviderRpcClient from the provider Ethereum address
 * and delegates to the SDK's `submitWotsPublicKey` for polling + submission.
 */

import { submitWotsPublicKey as sdkSubmitWotsPublicKey } from "@babylonlabs-io/ts-sdk/tbv/core/services";

import { stripHexPrefix } from "@/utils/btc";
import { createVpClient } from "@/utils/rpc";

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
    peginTxHash,
    depositorBtcPubkey,
    providerAddress,
    wotsPublicKeys,
    signal,
  } = params;

  const rpcClient = createVpClient(providerAddress);

  await sdkSubmitWotsPublicKey({
    statusReader: rpcClient,
    wotsSubmitter: rpcClient,
    peginTxid: stripHexPrefix(peginTxHash),
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    wotsPublicKeys,
    signal,
  });
}
