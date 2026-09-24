/**
 * Generic chunk + attribute + dispatch loop for VP batch RPCs.
 *
 * Wraps {@link attributeBatchResults} with chunking and per-callback
 * dispatch so the FE polling hooks (and any future SDK consumer) only
 * have to declare per-item handlers — chunking by `VP_BATCH_MAX_SIZE`,
 * vault-id normalization (strip `0x`, lowercase), missing/duplicate/
 * unexpected surfacing, and the duplicate-skip invariant in the
 * byVaultId loop are all owned here.
 *
 * @module tbv/core/clients/vault-provider/batchPoll
 */

import {
  attributeBatchResults,
  normalizeVaultId,
  type BatchResultEntry,
} from "./batchAttribution";
import { VP_BATCH_MAX_SIZE } from "./types";
import { isVaultIdHex } from "./validators";

export interface BatchPollByProviderOptions<TItem, TResult> {
  /** Items to poll for this provider, e.g. `DepositToPoll[]`. */
  items: TItem[];
  /** Extract the on-chain vault id for each item. Helper normalizes it. */
  getVaultId: (item: TItem) => string;
  /**
   * Per-chunk RPC call. Receives normalized (unprefixed, lowercase)
   * vault ids; returns the batch envelope. Caller wraps
   * `rpcClient.batchGet*StatusByVaultId({ vault_ids })`.
   */
  batchCall: (
    vaultIds: string[],
  ) => Promise<{ results: ReadonlyArray<BatchResultEntry<TResult>> }>;
  /**
   * Handle a per-item envelope. Exactly one of `result` / `error` is
   * populated (validator invariant). Caller decides UI state, logging,
   * etc. Not invoked for vault ids surfaced via {@link onDuplicate}.
   *
   * Note: `envelope.vault_id` is the normalized vault id the helper
   * sent in the request, not whatever case/encoding the server echoed.
   *
   * Also dispatched with a locally-produced `error` for an item whose
   * `getVaultId` is not a well-formed vault id. Such an item is never
   * sent, because an unattributable id comes back as `missing` and would
   * blame the provider for a caller-side defect.
   */
  onItem: (item: TItem, envelope: BatchResultEntry<TResult>) => void;
  /** Server omitted this item from the response. */
  onMissing: (item: TItem) => void;
  /** Server returned this item more than once. Caller picks UI state. */
  onDuplicate: (item: TItem) => void;
  /**
   * Optional aggregate signal for an entire chunk where the server
   * returned duplicates. Fires once per chunk (only if `count > 0`)
   * AFTER all per-item `onDuplicate` dispatches. Caller typically logs
   * the count alongside the provider name.
   */
  onDuplicateBatch?: (count: number) => void;
  /**
   * The whole chunk's RPC call failed (transport or response
   * validation). Receives the chunk and the error. Caller decides how
   * to project that onto per-item state.
   */
  onWholeBatchError: (chunk: TItem[], error: unknown) => void;
  /**
   * Server returned vault ids that were not in the request. Caller
   * typically logs the count for observability — there's no recovery
   * action since the original request items are unaffected. Optional;
   * defaults to no-op.
   */
  onUnexpected?: (echoedVaultIds: string[]) => void;
  /**
   * Maximum items per RPC call. Defaults to {@link VP_BATCH_MAX_SIZE}.
   * Exposed for tests so chunking can be exercised without 50+
   * fixtures.
   */
  batchSize?: number;
}

export async function batchPollByProvider<TItem, TResult>(
  options: BatchPollByProviderOptions<TItem, TResult>,
): Promise<void> {
  const {
    items,
    getVaultId,
    batchCall,
    onItem,
    onMissing,
    onDuplicate,
    onDuplicateBatch,
    onWholeBatchError,
    onUnexpected,
    batchSize = VP_BATCH_MAX_SIZE,
  } = options;

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error(
      `batchPollByProvider: batchSize must be a positive integer, got ${batchSize}`,
    );
  }

  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const vaultIdToItem = new Map<string, TItem>();
    const vaultIds: string[] = [];
    // Only the items actually sent — an item rejected below already got its
    // own `onItem` error and must not be re-reported by `onWholeBatchError`.
    const polled: TItem[] = [];
    for (const item of chunk) {
      const rawVaultId = getVaultId(item);
      if (!isVaultIdHex(rawVaultId)) {
        onItem(item, {
          vault_id: String(rawVaultId),
          result: null,
          error: `Invalid vault id "${String(rawVaultId)}" — not a 64-char hex string`,
        });
        continue;
      }
      const normalized = normalizeVaultId(rawVaultId);
      vaultIdToItem.set(normalized, item);
      vaultIds.push(normalized);
      polled.push(item);
    }
    if (vaultIds.length === 0) continue;

    // Both the RPC call and attribution sit inside the same try/catch
    // so a malformed-batch validator throw is routed through
    // `onWholeBatchError` rather than aborting the polling pass.
    let attribution;
    try {
      const response = await batchCall(vaultIds);
      attribution = attributeBatchResults<TResult>(vaultIds, response.results);
    } catch (error) {
      onWholeBatchError(polled, error);
      continue;
    }

    if (onUnexpected && attribution.unexpected.length > 0) {
      onUnexpected(attribution.unexpected);
    }

    const duplicateVaultIds = new Set(attribution.duplicate);
    for (const vaultId of duplicateVaultIds) {
      const item = vaultIdToItem.get(vaultId);
      if (item) onDuplicate(item);
    }
    if (onDuplicateBatch && duplicateVaultIds.size > 0) {
      onDuplicateBatch(duplicateVaultIds.size);
    }
    for (const vaultId of attribution.missing) {
      const item = vaultIdToItem.get(vaultId);
      if (item) onMissing(item);
    }
    for (const [vaultId, envelope] of attribution.byVaultId) {
      // Skip duplicates — already dispatched via onDuplicate above.
      if (duplicateVaultIds.has(vaultId)) continue;
      const item = vaultIdToItem.get(vaultId);
      if (!item) continue;
      onItem(item, {
        vault_id: vaultId,
        result: envelope.result,
        error: envelope.error,
      });
    }
  }
}
