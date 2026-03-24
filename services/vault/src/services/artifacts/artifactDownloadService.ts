/**
 * Service for fetching and downloading BaBe Decryptor artifacts.
 *
 * These artifacts are required for the depositor to independently claim
 * their vault funds. They are retrieved from the vault provider after
 * the Lamport key has been submitted and the vault is fully set up.
 *
 * Artifacts can be very large (tens of MB), so we avoid parsing the full
 * JSON response into memory. Instead we stream the raw response text
 * directly to a Blob for download.
 */

import { stripHexPrefix } from "@/utils/btc";
import { JsonRpcClient, JsonRpcError, getVpProxyUrl } from "@/utils/rpc";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/** Error responses are typically small; artifact payloads are tens of MB. */
const ERROR_RESPONSE_SIZE_THRESHOLD = 4096;

/**
 * Fetch artifacts from the vault provider and trigger a browser file download.
 *
 * Uses JsonRpcClient.callRaw() so the large payload is never fully parsed
 * into a JS object while still getting retry logic and consistent error
 * handling. Error responses are small enough to parse safely.
 *
 * @param providerAddress - Vault provider's Ethereum address.
 * @param peginTxid       - Bitcoin pegin transaction ID (hex, with or without 0x prefix).
 * @param depositorPk     - Depositor's Bitcoin public key.
 */
export async function fetchAndDownloadArtifacts(
  providerAddress: string,
  peginTxid: string,
  depositorPk: string,
): Promise<void> {
  const client = new JsonRpcClient({
    baseUrl: getVpProxyUrl(providerAddress),
    timeout: RPC_TIMEOUT_MS,
  });

  const response = await client.callRaw(
    "vaultProvider_requestDepositorClaimerArtifacts",
    {
      pegin_txid: stripHexPrefix(peginTxid),
      depositor_pk: stripHexPrefix(depositorPk),
    },
  );

  const blob = await response.blob();

  if (blob.size < ERROR_RESPONSE_SIZE_THRESHOLD) {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (parsed.error) {
      throw new JsonRpcError(parsed.error.code, parsed.error.message);
    }
  }

  triggerBlobDownload(blob, peginTxid);
}

/**
 * Trigger a browser file download from a Blob.
 */
function triggerBlobDownload(blob: Blob, peginTxid: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `babylon-vault-artifacts-${stripHexPrefix(peginTxid).slice(0, 8)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
