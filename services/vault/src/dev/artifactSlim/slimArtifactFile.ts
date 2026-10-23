/**
 * Cut a saved recovery artifact file (~1.4 GB) down to the slim file the
 * depositor-as-claimer signing needs: the transaction graph, the verifying
 * key and the challenger list (~1.8 MB). Runs entirely in the browser.
 *
 * The file is read from disk with `file.stream()` and fed to the same
 * streaming validator the deposit-time download uses, so every byte is
 * checked and only a few KB of state plus the captured graph are held in
 * memory. The file is never turned into one string: `JSON.parse` on a body
 * this size exceeds V8's maximum string length.
 *
 * Output has the top-level shape of `slim-vp-artifacts.mjs` on
 * `test/2111-ledger-claim-driver`, so that branch's `/dev/claim-ledger` page
 * can load it. `source` differs: it records the `File` fields instead of a
 * path and mtime, and has no `babe_sessions` byte range.
 *
 * Dev-only tooling; never shipped.
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

import { ArtifactStreamValidator } from "@/services/artifacts/streamingArtifactValidator";

/**
 * The saved file is the JSON-RPC envelope's `result` value alone, while the
 * validator parses the whole envelope. Wrapping the file in the same framing
 * `httpArtifactDownload.ts` builds lets the validator run unchanged.
 */
const ENVELOPE_HEAD = '{"jsonrpc":"2.0","id":1,"result":';
const ENVELOPE_TAIL = "}";

export interface SlimArtifactSummary {
  prePeginOutpoint: string;
  challengerCount: number;
  inputBytes: number;
  outputBytes: number;
  elapsedMs: number;
  graphSha256: string;
}

export interface SlimArtifactResult {
  slimJson: string;
  summary: SlimArtifactSummary;
}

interface SlimArtifactOptions {
  onProgress?: (bytesRead: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

function readPrePeginOutpoint(txGraph: Record<string, unknown>): string {
  const peginTx = txGraph.pegin_tx as
    | { tx?: { input?: { previous_output?: unknown }[] } }
    | undefined;
  const outpoint = peginTx?.tx?.input?.[0]?.previous_output;
  if (typeof outpoint !== "string") {
    throw new Error(
      "tx_graph_json has no pegin_tx.tx.input[0].previous_output",
    );
  }
  return outpoint;
}

export async function slimArtifactFile(
  file: File,
  options: SlimArtifactOptions = {},
): Promise<SlimArtifactResult> {
  const startedAt = performance.now();
  const encoder = new TextEncoder();
  const validator = new ArtifactStreamValidator();
  validator.update(encoder.encode(ENVELOPE_HEAD));

  const reader = file.stream().getReader();
  let bytesRead = 0;
  options.onProgress?.(0, file.size);
  try {
    while (true) {
      options.signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      validator.update(value);
      bytesRead += value.byteLength;
      options.onProgress?.(bytesRead, file.size);
    }
  } catch (err) {
    await reader.cancel().catch(() => undefined);
    throw err;
  } finally {
    reader.releaseLock();
  }

  validator.update(encoder.encode(ENVELOPE_TAIL));
  const { result, txGraph } = validator.finish();

  const prePeginOutpoint = readPrePeginOutpoint(txGraph);
  const challengers = Object.keys(result.babe_sessions);
  const graphSha256 = bytesToHex(sha256(encoder.encode(result.tx_graph_json)));
  const slimJson = JSON.stringify({
    tx_graph_json: result.tx_graph_json,
    verifying_key_hex: result.verifying_key_hex,
    babe_challengers: challengers,
    source: {
      fileName: file.name,
      size: file.size,
      lastModified: file.lastModified,
      graphSha256,
    },
  });

  return {
    slimJson,
    summary: {
      prePeginOutpoint,
      challengerCount: challengers.length,
      inputBytes: bytesRead,
      outputBytes: encoder.encode(slimJson).byteLength,
      elapsedMs: performance.now() - startedAt,
      graphSha256,
    },
  };
}
