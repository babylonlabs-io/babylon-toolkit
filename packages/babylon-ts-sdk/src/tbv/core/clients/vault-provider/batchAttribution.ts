/**
 * Defensive helper for attributing per-item results in a VP batch RPC
 * response back to the requested vault ids. The server promises 1:1 ordered
 * results, but we don't trust that promise — a server bug could duplicate,
 * skip, or scramble items, and silent attribution-by-array-index would
 * mask the bug.
 *
 * Normalizes vault ids on both sides (strip `0x`, lowercase) to absorb
 * prefix and case mismatch — the server echoes the request string verbatim.
 *
 * @module tbv/core/clients/vault-provider/batchAttribution
 */

/** Per-item entry in a VP batch response. */
export interface BatchResultEntry<T> {
  vault_id: string;
  result: T | null;
  error: string | null;
}

/** Output of {@link attributeBatchResults}. */
export interface BatchAttributionResult<T> {
  /** Normalized requested vault id -> per-item envelope. */
  byVaultId: Map<string, { result: T | null; error: string | null }>;
  /** Requested vault ids that did not appear in the response. */
  missing: string[];
  /** Echoed vault ids that were not in the request — logged + dropped. */
  unexpected: string[];
  /** Echoed vault ids that appeared more than once — first kept, rest dropped. */
  duplicate: string[];
}

/** Normalize a vault id for map keys: strip an optional `0x`, lowercase. */
export function normalizeVaultId(vaultId: string): string {
  const unprefixed = vaultId.startsWith("0x") ? vaultId.slice(2) : vaultId;
  return unprefixed.toLowerCase();
}

/**
 * Attribute batch results to requested vault ids defensively.
 *
 * Both `requestedVaultIds` and the echoed `vault_id` field on each result
 * are normalized before lookup. Duplicates and unexpected echoes are
 * surfaced so callers can flag the affected items as errored rather than
 * silently overwriting state.
 *
 * `requestedVaultIds` may contain duplicates; they are de-duplicated for the
 * purposes of map keys (each unique vault id becomes a single map entry).
 */
export function attributeBatchResults<T>(
  requestedVaultIds: string[],
  results: ReadonlyArray<BatchResultEntry<T>>,
): BatchAttributionResult<T> {
  const requestedSet = new Set<string>();
  for (const vaultId of requestedVaultIds) {
    requestedSet.add(normalizeVaultId(vaultId));
  }

  const byVaultId = new Map<
    string,
    { result: T | null; error: string | null }
  >();
  const seen = new Set<string>();
  const duplicate: string[] = [];
  const unexpected: string[] = [];

  for (const entry of results) {
    const normalized = normalizeVaultId(entry.vault_id);
    if (!requestedSet.has(normalized)) {
      unexpected.push(normalized);
      continue;
    }
    if (seen.has(normalized)) {
      duplicate.push(normalized);
      continue;
    }
    seen.add(normalized);
    byVaultId.set(normalized, { result: entry.result, error: entry.error });
  }

  const missing: string[] = [];
  for (const vaultId of requestedSet) {
    if (!seen.has(vaultId)) missing.push(vaultId);
  }

  return { byVaultId, missing, unexpected, duplicate };
}
