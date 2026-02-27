/**
 * Service for fetching and downloading BaBe Decryptor artifacts.
 *
 * These artifacts are required for the depositor to independently claim
 * their vault funds. They are retrieved from the vault provider after
 * the Lamport key has been submitted and the vault is fully set up.
 */

import { VaultProviderRpcApi } from "@/clients/vault-provider-rpc";
import type { RequestDepositorClaimerArtifactsResponse } from "@/clients/vault-provider-rpc/types";
import { stripHexPrefix } from "@/utils/btc";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/**
 * Request the depositor-as-claimer artifacts from the vault provider.
 *
 * @param providerUrl - Base URL of the vault provider RPC endpoint.
 * @param peginTxid   - Bitcoin pegin transaction ID (hex, with or without 0x prefix).
 * @param depositorPk - Depositor's Bitcoin public key.
 * @returns The artifact payload containing BaBe session data and challenger info.
 */
export async function fetchDepositorArtifacts(
  providerUrl: string,
  peginTxid: string,
  depositorPk: string,
): Promise<RequestDepositorClaimerArtifactsResponse> {
  const rpcClient = new VaultProviderRpcApi(providerUrl, RPC_TIMEOUT_MS);
  return rpcClient.requestDepositorClaimerArtifacts({
    pegin_txid: stripHexPrefix(peginTxid),
    depositor_pk: depositorPk,
  });
}

/**
 * Trigger a browser file download of the artifact JSON.
 *
 * Creates a temporary Blob URL and programmatically clicks a hidden
 * anchor element to save the file as `babylon-vault-artifacts-<txid>.json`.
 *
 * @param artifacts - The artifact response to serialize.
 * @param peginTxid - Used to name the downloaded file.
 */
export function triggerArtifactDownload(
  artifacts: RequestDepositorClaimerArtifactsResponse,
  peginTxid: string,
): void {
  const blob = new Blob([JSON.stringify(artifacts)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `babylon-vault-artifacts-${peginTxid.slice(0, 8)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
