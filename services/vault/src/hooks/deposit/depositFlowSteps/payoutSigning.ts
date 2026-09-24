/**
 * Step 4: Payout signing — adapter over SDK's runDepositorPresignFlow.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import type { DepositTerms } from "@babylonlabs-io/ts-sdk/tbv/core";
import {
  canonicalizeBtcPubkey,
  stripHexPrefix,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { runDepositorPresignFlow } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Address, Hex } from "viem";

import { logger } from "@/infrastructure";
import { LocalStorageStatus } from "@/models/peginStateMachine";
import {
  prepareSigningContext,
  type PayoutSigningPhase,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import {
  recordSignedGraphFingerprint,
  updatePendingPeginStatus,
} from "@/storage/peginStorage";
import { DepositorBtcKeyMismatchError } from "@/utils/errors/depositorWalletMismatch";
import { assertVaultCoreVersionSupported } from "@/utils/vaultCoreVersionSupport";

import { ensureAuthenticatedVpClient } from "./ensureAuthenticatedVpClient";
import { DepositFlowStep } from "./types";

/** The deposit-flow step that a given payout-signing phase renders as. */
export function payoutSigningStep(phase: PayoutSigningPhase): DepositFlowStep {
  switch (phase) {
    case "auth":
      return DepositFlowStep.SIGN_AUTH_ANCHOR;
    case "graph":
      return DepositFlowStep.SIGN_DEPOSITOR_GRAPH;
    default:
      return DepositFlowStep.SIGN_PAYOUTS;
  }
}

export interface SignAndSubmitPayoutsParams {
  vaultId: Hex;
  peginTxHash: string;
  depositorBtcPubkey: string;
  /** Optional hint; resolved from GraphQL if missing. */
  providerBtcPubKey?: string;
  registeredPayoutScriptPubKey: string;
  btcWallet: BitcoinWallet;
  depositorEthAddress: Address;
  unsignedPrePeginTxHex: string;
  /** Required for approval-capable wallets; the resume path rebuilds it from chain. */
  depositTerms?: DepositTerms;
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
    depositTerms,
    signal,
    onProgress,
  } = params;

  const { context, vaultProviderAddress } = await prepareSigningContext({
    vaultId,
    depositorBtcPubkey,
    vaultProviderBtcPubKey: providerBtcPubKey,
    registeredPayoutScriptPubKey,
  });

  // The caller can read the key once, at wallet connect. Read the live key
  // again, so a wallet switch since then cannot sign.
  const expectedDepositorBtcPubkey = canonicalizeBtcPubkey(depositorBtcPubkey);
  const connectedBtcPubkey = canonicalizeBtcPubkey(
    await btcWallet.getPublicKeyHex(),
  );
  if (connectedBtcPubkey !== expectedDepositorBtcPubkey) {
    throw new DepositorBtcKeyMismatchError({
      vaultId,
      expectedDepositorBtcPubkey,
      connectedBtcPubkey,
    });
  }

  // Fail closed before the first wallet popup when this build's WASM can't
  // rebuild the vault's stamped graph version.
  await assertVaultCoreVersionSupported(context.vaultCoreVersion);

  const peginTxid = stripHexPrefix(peginTxHash);

  // Surface the auth-anchor signature as its own "Authenticate session" step.
  // The VP auth popup fires inside ensureAuthenticatedVpClient below; without
  // this, currentStep skips straight from "await payout" to "sign payout", so a
  // rejection here would land on (and the auth step would falsely complete as)
  // the next step.
  onProgress?.({ phase: "auth", completed: 0, total: 0 });

  const rpcClient = await ensureAuthenticatedVpClient({
    btcWallet,
    vaultId,
    unsignedPrePeginTxHex,
    peginTxHash,
    providerAddress: vaultProviderAddress,
    depositorBtcPubkey,
    // A signing failure idles the device mirror; the retry must re-derive or
    // approval wallets strand at "no approved intent" forever.
    requireFreshDeviceCeremony: true,
  });

  await runDepositorPresignFlow({
    statusReader: rpcClient,
    presignClient: rpcClient,
    btcWallet,
    peginTxid,
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    signingContext: context,
    depositTerms,
    signal,
    onProgress: onProgress
      ? (completed, total) =>
          onProgress({ phase: "claimers", completed, total })
      : undefined,
    // pegin.md §5.9: the artifact download refuses a bundle whose graph does
    // not reproduce this. A failed write throws and stops the flow before any
    // signature is sent.
    recordGraphFingerprint: (fingerprint) => {
      if (
        !recordSignedGraphFingerprint(depositorEthAddress, vaultId, fingerprint)
      ) {
        // A cross-device resume has no local entry to hold it. Signing goes
        // on, and the artifact download for this vault then fails closed.
        logger.warn("No local deposit entry to hold the presign fingerprint", {
          category: "activation",
          vaultId,
        });
      }
    },
  });

  onProgress?.(null);

  updatePendingPeginStatus(
    depositorEthAddress,
    vaultId,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}
