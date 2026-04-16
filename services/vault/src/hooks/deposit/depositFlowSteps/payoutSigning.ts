/**
 * Step 3: Payout signing — adapter over SDK's pollAndSignPayouts
 *
 * Uses prepareSigningContext() to fetch VERSIONED vault keepers and
 * universal challengers from the contract, then delegates all signing
 * and VP submission to the SDK.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { pollAndSignPayouts } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import type { Address } from "viem";

import { LocalStorageStatus } from "@/models/peginStateMachine";
import {
  prepareSigningContext,
  type PayoutSigningProgress,
} from "@/services/vault/vaultPayoutSignatureService";
import { updatePendingPeginStatus } from "@/storage/peginStorage";
import { stripHexPrefix } from "@/utils/btc";
import { createVpClient } from "@/utils/rpc";

export interface SignAndSubmitPayoutsParams {
  /** Derived vault ID (for contract reads + localStorage) */
  vaultId: string;
  /** Raw BTC pegin transaction hash */
  peginTxHash: string;
  depositorBtcPubkey: string;
  /** Vault provider BTC public key hint (optional — resolved from GraphQL if missing) */
  providerBtcPubKey?: string;
  /** Depositor's registered payout scriptPubKey (hex) */
  registeredPayoutScriptPubKey: string;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
  /** Depositor's Ethereum address (for localStorage) */
  depositorEthAddress: Address;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Progress callback (completed, total) */
  onProgress?: (progress: PayoutSigningProgress | null) => void;
}

/**
 * Poll VP, sign payout transactions + depositor graph, and submit signatures.
 *
 * This replaces the previous 4-step manual flow with:
 * 1. prepareSigningContext() — fetches versioned VK/UC from contract
 * 2. SDK pollAndSignPayouts() — handles polling, signing, submission
 * 3. localStorage update
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
    signal,
    onProgress,
  } = params;

  // Phase 1: Build signing context from contract (versioned VK/UC)
  // Also returns the contract-authoritative vault provider address, which
  // must be used for RPC instead of the caller-supplied address to prevent
  // submitting signatures to a stale/wrong VP.
  const { context, vaultProviderAddress } = await prepareSigningContext({
    vaultId,
    depositorBtcPubkey,
    vaultProviderBtcPubKey: providerBtcPubKey,
    registeredPayoutScriptPubKey,
  });

  // Phase 2: SDK handles polling → presign fetch → signing → submission
  const rpcClient = createVpClient(vaultProviderAddress);
  await pollAndSignPayouts({
    statusReader: rpcClient,
    presignClient: rpcClient,
    btcWallet,
    peginTxid: stripHexPrefix(peginTxHash),
    depositorPk: stripHexPrefix(depositorBtcPubkey),
    signingContext: context,
    signal,
    onProgress: onProgress
      ? (completed, totalClaimers) => onProgress({ completed, totalClaimers })
      : undefined,
  });

  onProgress?.(null);

  // Phase 3: Update localStorage
  updatePendingPeginStatus(
    depositorEthAddress,
    vaultId,
    LocalStorageStatus.PAYOUT_SIGNED,
  );
}
