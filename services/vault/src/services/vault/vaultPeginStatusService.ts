/**
 * Vault PegIn Status Service
 *
 * Handles checking the status of a PegIn transaction from the vault provider's backend.
 */

import type { Hex } from "viem";

import { VaultProviderRpcApi } from "../../clients/vault-provider-rpc";
import { DaemonStatus } from "../../models/peginStateMachine";
import { stripHexPrefix } from "../../utils/btc";

/**
 * Vault provider information for status check
 */
export interface VaultProviderInfo {
  /** Ethereum address of the vault provider */
  address: Hex;
  /** RPC URL of the vault provider */
  url: string;
}

/**
 * Result of checking PegIn status from vault provider
 */
export interface PeginStatusResult {
  /** Status from vault provider's backend database */
  status: DaemonStatus;
  /** Raw status string from the API */
  rawStatus: string;
}

/**
 * Check the status of a PegIn transaction from the vault provider's backend
 *
 * @param peginTxId - Peg-in transaction ID (with or without 0x prefix)
 * @param vaultProvider - Vault provider information
 * @returns The current daemon status
 * @throws Error if the RPC call fails or status is invalid
 */
export async function checkPeginStatus(
  peginTxId: string,
  vaultProvider: VaultProviderInfo,
): Promise<PeginStatusResult> {
  // Validate inputs
  if (!peginTxId || typeof peginTxId !== "string") {
    throw new Error("Invalid peginTxId: must be a non-empty string");
  }

  if (!vaultProvider?.url) {
    throw new Error("Invalid vaultProvider: must have url property");
  }

  // Create RPC client
  const rpcClient = new VaultProviderRpcApi(vaultProvider.url, 30000);

  // Note: Bitcoin Txid expects hex without "0x" prefix (64 chars)
  // Frontend uses Ethereum-style "0x"-prefixed hex, so we strip it
  const response = await rpcClient.getPeginStatus({
    pegin_txid: stripHexPrefix(peginTxId),
  });

  // Parse the status string into DaemonStatus enum
  // State flow: PendingBabeSetup -> PendingChallengerPresigning -> PendingDepositorSignatures -> PendingACKs -> PendingActivation -> Activated
  const rawStatus = response.status;
  let status: DaemonStatus;

  switch (rawStatus) {
    case "PendingBabeSetup":
      status = DaemonStatus.PENDING_BABE_SETUP;
      break;
    case "PendingDepositorLamportPk":
      status = DaemonStatus.PENDING_DEPOSITOR_LAMPORT_PK;
      break;
    case "PendingChallengerPresigning":
      status = DaemonStatus.PENDING_CHALLENGER_PRESIGNING;
      break;
    case "PendingDepositorSignatures":
      status = DaemonStatus.PENDING_DEPOSITOR_SIGNATURES;
      break;
    case "PendingACKs":
      status = DaemonStatus.PENDING_ACKS;
      break;
    case "PendingActivation":
      status = DaemonStatus.PENDING_ACTIVATION;
      break;
    case "Activated":
      status = DaemonStatus.ACTIVATED;
      break;
    default:
      throw new Error(`Unknown daemon status: ${rawStatus}`);
  }

  return {
    status,
    rawStatus,
  };
}
