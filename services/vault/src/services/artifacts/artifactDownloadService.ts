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
import { JsonRpcError } from "@/utils/rpc";

/** Timeout for the artifact request RPC call (artifacts can be large). */
const RPC_TIMEOUT_MS = 120 * 1000;

/**
 * Fetch artifacts from the vault provider and trigger a browser file download.
 *
 * Uses a raw fetch + response.blob() pipeline so the large payload is never
 * fully parsed into a JS object. Error responses are small enough to parse
 * safely.
 */
export async function fetchAndDownloadArtifacts(
  providerUrl: string,
  peginTxid: string,
  depositorPk: string,
): Promise<void> {
  const baseUrl = providerUrl.replace(/\/$/, "");
  const request = {
    jsonrpc: "2.0" as const,
    method: "vaultProvider_requestDepositorClaimerArtifacts",
    params: [
      {
        pegin_txid: stripHexPrefix(peginTxid),
        depositor_pk: stripHexPrefix(depositorPk),
      },
    ],
    id: 1,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const text = await readBlobStart(blob);

    if (text.includes('"error"')) {
      const parsed = JSON.parse(await blob.text());
      if (parsed.error) {
        throw new JsonRpcError(
          parsed.error.code,
          parsed.error.message,
          parsed.error.data,
        );
      }
    }

    triggerBlobDownload(blob, peginTxid);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new JsonRpcError(
        -32000,
        `Request timeout after ${RPC_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  }
}

/**
 * Read the first N bytes of a Blob as text for lightweight error detection.
 */
function readBlobStart(blob: Blob, bytes = 200): Promise<string> {
  return blob.slice(0, bytes).text();
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
