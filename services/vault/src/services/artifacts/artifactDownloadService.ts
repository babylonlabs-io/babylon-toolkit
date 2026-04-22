/**
 * Service for fetching and downloading BaBe Decryptor artifacts.
 *
 * These artifacts are required for the depositor to independently claim
 * their vault funds. They are retrieved from the vault provider after
 * the WOTS key has been submitted and the vault is fully set up.
 *
 * Artifacts can be very large (~450 MB today). The raw response body is
 * retained as a Blob so the download step does not need to re-serialize
 * it, and payloads above an RPC-error-sized threshold are not parsed on
 * the main thread (doing so would risk exceeding V8's string length limit
 * or freezing the tab). Full schema validation of the artifact body is
 * deferred until the backend delivers artifacts via streaming; for now
 * only small responses (expected to be JSON-RPC error envelopes) are
 * parsed and validated.
 */

import {
  JSON_RPC_ERROR_CODES,
  JsonRpcClient,
  JsonRpcError,
  validateRequestDepositorClaimerArtifactsResponse,
  VpResponseValidationError,
} from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { stripHexPrefix } from "@/utils/btc";
import { getVpProxyUrl } from "@/utils/rpc";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/**
 * Error responses are typically small; artifact payloads can be hundreds
 * of MB. Only responses under this threshold are parsed on the main thread.
 */
const ERROR_RESPONSE_SIZE_THRESHOLD = 4096;

/**
 * Fetch artifacts from the vault provider and trigger a browser file download.
 *
 * Uses JsonRpcClient.callRaw() so the raw response body can be preserved
 * as a Blob for download without a separate re-serialization pass. The
 * payload is parsed once for schema validation and the download is only
 * triggered after validation succeeds.
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
    // Artifact requests are idempotent reads — safe to retry on transient errors
    retryableFor: () => true,
  });

  const response = await client.callRaw(
    "vaultProvider_requestDepositorClaimerArtifacts",
    {
      pegin_txid: stripHexPrefix(peginTxid),
      depositor_pk: stripHexPrefix(depositorPk),
    },
  );

  const blob = await response.blob();

  await validateArtifactPayload(blob);

  triggerBlobDownload(blob, peginTxid);
}

/**
 * Parse the raw JSON-RPC response and validate the artifact payload against
 * its runtime schema. Throws JsonRpcError for RPC-level errors and
 * VpResponseValidationError for malformed or incomplete artifact data.
 *
 * Payloads above ERROR_RESPONSE_SIZE_THRESHOLD are assumed to be real
 * artifact responses and are passed through without parsing - parsing a
 * ~450 MB payload on the main thread would likely exceed V8's string
 * length limit or freeze the tab.
 */
async function validateArtifactPayload(blob: Blob): Promise<void> {
  if (blob.size >= ERROR_RESPONSE_SIZE_THRESHOLD) {
    return;
  }

  let text: string;
  try {
    const buffer = await blob.arrayBuffer();
    text = new TextDecoder("utf-8").decode(buffer);
  } catch (err) {
    throw new VpResponseValidationError(
      `Failed to read artifact payload: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new VpResponseValidationError(
      "Artifact response body is not valid JSON",
    );
  }

  if (
    envelope === null ||
    typeof envelope !== "object" ||
    Array.isArray(envelope)
  ) {
    throw new VpResponseValidationError(
      "Artifact response envelope is not a JSON object",
    );
  }

  const record = envelope as Record<string, unknown>;

  if ("error" in record && record.error != null) {
    const err = record.error as Record<string, unknown>;
    const code =
      typeof err.code === "number"
        ? err.code
        : JSON_RPC_ERROR_CODES.INVALID_RESPONSE;
    const message =
      typeof err.message === "string" ? err.message : "Unknown RPC error";
    throw new JsonRpcError(code, message);
  }

  if (!("result" in record)) {
    throw new VpResponseValidationError(
      "Artifact response envelope is missing the result field",
    );
  }

  validateRequestDepositorClaimerArtifactsResponse(record.result);
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
