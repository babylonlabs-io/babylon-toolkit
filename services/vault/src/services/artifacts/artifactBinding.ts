/**
 * Binds a downloaded artifact bundle to the deposit it was requested for.
 *
 * The response envelope echoes neither the pegin txid nor the depositor key,
 * so on its own "schema-valid" only means "shaped like a bundle" — it could
 * belong to a different vault entirely. The transaction graph inside
 * `tx_graph_json` does carry that identity, and every expected value is
 * already in hand as a parameter of the request we just made, so no on-chain
 * read is needed.
 *
 * Checked here (all derived from a real vault-devnet bundle):
 * - `claim_tx` and `payout_tx` each spend an output of the requested pegin
 *   transaction, which is what ties the graph to *this* deposit
 * - `depositor_pubkey` is the depositor we asked on behalf of
 * - the `babe_sessions` keys are exactly the graph's own
 *   `challenger_pubkeys.local ∪ .universal`
 *
 * What this does NOT establish: that the artifact bytes decrypt correctly, or
 * that a hostile provider could not fabricate a self-consistent bundle. The
 * expected values here are all public, so a determined provider can satisfy
 * every check while returning garbage payloads. This catches a provider
 * serving the wrong deposit's bundle, a stale or mis-keyed cache, and an
 * internally inconsistent graph — not a targeted forgery. Proving the payload
 * itself needs a BaBe verifier, which does not exist client-side.
 */

import { stripHexPrefix } from "@babylonlabs-io/ts-sdk/tbv/core";
import { VpResponseValidationError } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

/** The deposit a bundle must belong to, taken from the request parameters. */
export interface VaultBindingContext {
  peginTxid: string;
  depositorPk: string;
}

/**
 * Transactions whose inputs must spend the pegin. `claim_tx` spends the
 * depositor-claim output and `payout_tx` the payout output, so both are
 * anchored to the same funding transaction.
 */
const PEGIN_SPENDING_TX_KEYS = ["claim_tx", "payout_tx"] as const;

function normalizeHex(value: string): string {
  return stripHexPrefix(value).toLowerCase();
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new VpResponseValidationError(
      `Artifact tx graph is missing the "${field}" object`,
    );
  }
  return value as Record<string, unknown>;
}

/**
 * Collect the txids referenced by a transaction's inputs.
 *
 * `previous_output` is serialized as `<txid>:<vout>` in display byte order —
 * the same order the pegin txid is supplied in.
 */
function inputTxids(txNode: unknown, field: string): string[] {
  const inputs = asRecord(asRecord(txNode, field).tx, `${field}.tx`).input;
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new VpResponseValidationError(
      `Artifact tx graph "${field}" has no inputs`,
    );
  }
  return inputs.map((input, index) => {
    const outpoint = asRecord(
      input,
      `${field}.tx.input[${index}]`,
    ).previous_output;
    if (typeof outpoint !== "string") {
      throw new VpResponseValidationError(
        `Artifact tx graph "${field}" input ${index} has no previous_output`,
      );
    }
    return normalizeHex(outpoint.split(":")[0] ?? "");
  });
}

function challengerSetFromGraph(graph: Record<string, unknown>): Set<string> {
  const pubkeys = asRecord(graph.challenger_pubkeys, "challenger_pubkeys");
  const combined: string[] = [];
  for (const role of ["local", "universal"] as const) {
    const entry = pubkeys[role];
    if (!Array.isArray(entry)) {
      throw new VpResponseValidationError(
        `Artifact tx graph challenger_pubkeys.${role} is not an array`,
      );
    }
    for (const key of entry) {
      if (typeof key !== "string") {
        throw new VpResponseValidationError(
          `Artifact tx graph challenger_pubkeys.${role} contains a non-string key`,
        );
      }
      combined.push(normalizeHex(key));
    }
  }
  const unique = new Set(combined);
  if (unique.size !== combined.length) {
    throw new VpResponseValidationError(
      "Artifact tx graph declares a challenger in both the local and universal sets",
    );
  }
  return unique;
}

/**
 * Throw unless the bundle demonstrably belongs to `expected`.
 *
 * @param txGraph        Parsed `tx_graph_json` from the response.
 * @param sessionPubkeys Challenger keys the response supplied sessions for.
 */
export function assertBundleBoundToVault(
  txGraph: Record<string, unknown>,
  sessionPubkeys: string[],
  expected: VaultBindingContext,
): void {
  const peginTxid = normalizeHex(expected.peginTxid);

  for (const field of PEGIN_SPENDING_TX_KEYS) {
    const txids = inputTxids(txGraph[field], field);
    if (!txids.includes(peginTxid)) {
      throw new VpResponseValidationError(
        `Artifact bundle is for a different deposit: "${field}" spends ${txids.join(", ")}, expected ${peginTxid}`,
      );
    }
  }

  const depositorPubkey = txGraph.depositor_pubkey;
  if (typeof depositorPubkey !== "string") {
    throw new VpResponseValidationError(
      "Artifact tx graph is missing depositor_pubkey",
    );
  }
  const expectedDepositor = normalizeHex(expected.depositorPk);
  if (normalizeHex(depositorPubkey) !== expectedDepositor) {
    throw new VpResponseValidationError(
      `Artifact bundle is for a different depositor: graph declares ${normalizeHex(depositorPubkey)}, expected ${expectedDepositor}`,
    );
  }

  // Self-consistency: the provider must have supplied a session for exactly
  // the challengers its own graph names — no missing entry that would leave
  // recovery material incomplete, no extra key the graph does not recognize.
  const graphChallengers = challengerSetFromGraph(txGraph);
  const supplied = new Set(sessionPubkeys.map(normalizeHex));
  const missing = [...graphChallengers].filter((key) => !supplied.has(key));
  const unexpected = [...supplied].filter((key) => !graphChallengers.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new VpResponseValidationError(
      "Artifact bundle session set does not match the tx graph's challengers" +
        (missing.length > 0 ? ` (missing: ${missing.join(", ")})` : "") +
        (unexpected.length > 0
          ? ` (unexpected: ${unexpected.join(", ")})`
          : ""),
    );
  }
}
