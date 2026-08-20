/**
 * Client-side search over the activity rows already loaded — the toolbar's
 * search box. Matches the transaction hash and the row's visible type text; no
 * new query hits the indexer.
 */

import { COPY } from "@/copy";
import type { ActivityRow } from "@/types/activityLog";

/** Hashes are matched with and without the `0x` prefix, so pasting either form
 *  from an explorer finds the row. */
function matchesHash(hash: string, query: string): boolean {
  const normalized = hash.toLowerCase().replace(/^0x/, "");
  return normalized.includes(query.replace(/^0x/, ""));
}

/**
 * @param query - Already lowercased and trimmed by the caller. An empty query
 *   matches everything.
 */
export function activityRowMatchesSearch(
  row: ActivityRow,
  query: string,
): boolean {
  if (query === "") return true;

  const typeLabel = COPY.activity.typeLabels[row.type].toLowerCase();
  if (typeLabel.includes(query)) return true;
  if (matchesHash(row.transactionHash, query)) return true;

  if (row.kind === "liquidationGroup") {
    return row.children.some(
      (child) =>
        child.label.toLowerCase().includes(query) ||
        matchesHash(child.transactionHash, query),
    );
  }

  return false;
}
