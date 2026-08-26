/**
 * Generic chunk + attribute + dispatch loop for VP batch RPCs.
 *
 * Wraps {@link attributeBatchResults} with chunking and per-callback
 * dispatch so the FE polling hooks (and any future SDK consumer) only
 * have to declare per-item handlers — chunking by `VP_BATCH_MAX_SIZE`,
 * lowercase txid normalization, missing/duplicate/unexpected
 * surfacing, and the duplicate-skip invariant in the byTxid loop are
 * all owned here.
 *
 * @module tbv/core/clients/vault-provider/batchPoll
 */

import {
  attributeBatchResults,
  type BatchResultEntry,
} from "./batchAttribution";
import { VP_BATCH_MAX_SIZE } from "./types";

export interface BatchPollByProviderOptions<TItem, TResult> {
  /** Items to poll for this provider, e.g. `DepositToPoll[]`. */
  items: TItem[];
  /** Extract the canonical txid for each item. Helper lowercases it. */
  getTxid: (item: TItem) => string;
  /**
   * Per-chunk RPC call. Receives lowercased txids; returns the batch
   * envelope. Caller wraps `rpcClient.batchGet*Status({ pegin_txids })`.
   */
  batchCall: (
    txids: string[],
  ) => Promise<{ results: ReadonlyArray<BatchResultEntry<TResult>> }>;
  /**
   * Handle a per-item envelope. Exactly one of `result` / `error` is
   * populated (validator invariant). Caller decides UI state, logging,
   * etc. Not invoked for txids surfaced via {@link onDuplicate}.
   *
   * Note: `envelope.pegin_txid` is the lowercased txid the helper
   * sent in the request, not whatever case/encoding the server echoed.
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
   * Server returned txids that were not in the request. Caller
   * typically logs the count for observability — there's no recovery
   * action since the original request items are unaffected. Optional;
   * defaults to no-op.
   */
  onUnexpected?: (echoedTxids: string[]) => void;
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
    getTxid,
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
    const txidToItem = new Map<string, TItem>();
    const txids: string[] = [];
    for (const item of chunk) {
      const lowerTxid = getTxid(item).toLowerCase();
      txidToItem.set(lowerTxid, item);
      txids.push(lowerTxid);
    }

    // Both the RPC call and attribution sit inside the same try/catch
    // so a malformed-batch validator throw is routed through
    // `onWholeBatchError` rather than aborting the polling pass.
    let attribution;
    try {
      const response = await batchCall(txids);
      attribution = attributeBatchResults<TResult>(txids, response.results);
    } catch (error) {
      onWholeBatchError(chunk, error);
      continue;
    }

    if (onUnexpected && attribution.unexpected.length > 0) {
      onUnexpected(attribution.unexpected);
    }

    const duplicateTxids = new Set(attribution.duplicate);
    for (const txid of duplicateTxids) {
      const item = txidToItem.get(txid);
      if (item) onDuplicate(item);
    }
    if (onDuplicateBatch && duplicateTxids.size > 0) {
      onDuplicateBatch(duplicateTxids.size);
    }
    for (const txid of attribution.missing) {
      const item = txidToItem.get(txid);
      if (item) onMissing(item);
    }
    for (const [txid, envelope] of attribution.byTxid) {
      // Skip duplicates — already dispatched via onDuplicate above.
      if (duplicateTxids.has(txid)) continue;
      const item = txidToItem.get(txid);
      if (!item) continue;
      onItem(item, {
        pegin_txid: txid,
        result: envelope.result,
        error: envelope.error,
      });
    }
  }
}
