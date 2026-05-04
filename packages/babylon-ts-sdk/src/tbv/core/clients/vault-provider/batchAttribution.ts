/**
 * Defensive helper for attributing per-item results in a VP batch RPC
 * response back to the requested txids. The server promises 1:1 ordered
 * results, but we don't trust that promise — a server bug could duplicate,
 * skip, or scramble items, and silent attribution-by-array-index would
 * mask the bug.
 *
 * Lowercases all txids on both sides to absorb case mismatch (the FE
 * strips `0x` but doesn't otherwise normalize).
 *
 * @module tbv/core/clients/vault-provider/batchAttribution
 */

/** Per-item entry in a VP batch response. */
export interface BatchResultEntry<T> {
  pegin_txid: string;
  result: T | null;
  error: string | null;
}

/** Output of {@link attributeBatchResults}. */
export interface BatchAttributionResult<T> {
  /** Lowercase requested txid -> per-item envelope. */
  byTxid: Map<string, { result: T | null; error: string | null }>;
  /** Requested txids that did not appear in the response. */
  missing: string[];
  /** Echoed txids that were not in the request — logged + dropped. */
  unexpected: string[];
  /** Echoed txids that appeared more than once — first kept, rest dropped. */
  duplicate: string[];
}

/**
 * Attribute batch results to requested txids defensively.
 *
 * Both `requestedTxids` and the echoed `pegin_txid` field on each result
 * are lowercased before lookup. Duplicates and unexpected echoes are
 * surfaced so callers can flag the affected items as errored rather than
 * silently overwriting state.
 *
 * `requestedTxids` may contain duplicates; they are de-duplicated for the
 * purposes of map keys (each unique txid becomes a single map entry).
 */
export function attributeBatchResults<T>(
  requestedTxids: string[],
  results: ReadonlyArray<BatchResultEntry<T>>,
): BatchAttributionResult<T> {
  const requestedSet = new Set<string>();
  for (const txid of requestedTxids) {
    requestedSet.add(txid.toLowerCase());
  }

  const byTxid = new Map<
    string,
    { result: T | null; error: string | null }
  >();
  const seen = new Set<string>();
  const duplicate: string[] = [];
  const unexpected: string[] = [];

  for (const entry of results) {
    const lower = entry.pegin_txid.toLowerCase();
    if (!requestedSet.has(lower)) {
      unexpected.push(lower);
      continue;
    }
    if (seen.has(lower)) {
      duplicate.push(lower);
      continue;
    }
    seen.add(lower);
    byTxid.set(lower, { result: entry.result, error: entry.error });
  }

  const missing: string[] = [];
  for (const txid of requestedSet) {
    if (!seen.has(txid)) missing.push(txid);
  }

  return { byTxid, missing, unexpected, duplicate };
}
