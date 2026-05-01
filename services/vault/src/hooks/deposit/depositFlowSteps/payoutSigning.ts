/**
 * Step 4: Payout signing — adapter over SDK's runDepositorPresignFlow.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { runDepositorPresignFlow } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Address } from "viem";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import {
  prepareSigningContext,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "@/storage/peginStorage";
import { stripHexPrefix } from "@/utils/btc";

import { ensureAuthenticatedVpClient } from "./ensureAuthenticatedVpClient";

export interface SignAndSubmitPayoutsParams {
  vaultId: string;
  peginTxHash: string;
  depositorBtcPubkey: string;
  /** Optional hint; resolved from GraphQL if missing. */
  providerBtcPubKey?: string;
  registeredPayoutScriptPubKey: string;
  btcWallet: BitcoinWallet;
  depositorEthAddress: Address;
  unsignedPrePeginTxHex: string;
  signal?: AbortSignal;
  onProgress?: (progress: PayoutSigningProgress | null) => void;
}

/**
 * Poll the VP for presign transactions, sign them with the BTC wallet,
 * and submit the signatures back. Auth-gated VP RPCs acquire bearer
 * tokens transparently via the registry; if the registry isn't already
 * primed for this peginTxid, derivation happens here (one popup).
 */
export async function signAndSubmitPayouts(
  params: SignAndSubmitPayoutsParams,
): Promise<void> {
  const {
    vaultId,
    peginTxHash,
    depositorBtcPubkey,
    providerBtcPubKey,
    registeredPayoutScriptPubKey,
    btcWallet,
    depositorEthAddress,
    unsignedPrePeginTxHex,
    signal,
    onProgress,
  } = params;

  const { context, vaultProviderAddress } = await prepareSigningContext({
    vaultId,
    depositorBtcPubkey,
    vaultProviderBtcPubKey: providerBtcPubKey,
    registeredPayoutScriptPubKey,
  });

  const peginTxid = stripHexPrefix(peginTxHash);
  const rpcClient = await ensureAuthenticatedVpClient({
    btcWallet,
    unsignedPrePeginTxHex,
    peginTxHash,
    providerAddress: vaultProviderAddress,
    depositorBtcPubkey,
  });

  await runDepositorPresignFlow({
    statusReader: rpcClient,
    presignClient: rpcClient,
    btcWallet,
    peginTxid,
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    signingContext: context,
    signal,
    onProgress: onProgress
      ? (completed, totalClaimers) => onProgress({ completed, totalClaimers })
      : undefined,
  });

  onProgress?.(null);

  updatePendingPeginStatus(
    depositorEthAddress,
    vaultId,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}
